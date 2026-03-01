"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../lib/supabase/client";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
  redirectTo?: string;
};

function sanitizeRedirectPath(value: string | undefined) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export function AuthForm({ mode, redirectTo }: AuthFormProps) {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const safeRedirectPath = sanitizeRedirectPath(redirectTo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "register") {
        const { error: signUpError, data } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}${safeRedirectPath}` }
        });
        if (signUpError) throw signUpError;
        if (data.user) {
          await supabase.from("users").upsert({
            id: data.user.id,
            email,
            subscription_status: "trial",
            plan_type: "starter"
          });
          // Quando è attiva la conferma email, non arriva subito una sessione: informiamo l'utente.
          if (!data.session) {
            setMessage("Ti abbiamo inviato un link di conferma via email. Aprilo e poi accedi con le tue credenziali.");
            return;
          }
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) throw signInError;
      }
      router.push(safeRedirectPath);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Errore inatteso");
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "register" ? "Crea un account" : "Accedi";
  const cta = mode === "register" ? "Registrati" : "Entra";
  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #cdd9e1",
    background: "#f6fafc",
    color: "var(--brand-dark)",
    WebkitTextFillColor: "var(--brand-dark)",
    caretColor: "var(--brand-dark)"
  };

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 440, margin: "0 auto" }}>
      <div className="pill">{title}</div>
      <div className="grid" style={{ marginTop: 16, gap: 12 }}>
        <label className="grid" style={{ gap: 6 }}>
          <span style={{ color: "var(--brand-dark)" }}>Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            style={inputStyle}
          />
        </label>
        <label className="grid" style={{ gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--brand-dark)" }}>Password</span>
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--muted)",
                padding: 0,
                fontSize: 13
              }}
            >
              {showPassword ? "Nascondi" : "Mostra"}
            </button>
          </div>
          <input
            required
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            style={inputStyle}
          />
        </label>
        {error && (
          <div className="text-muted" style={{ color: "#fca5a5" }}>
            {error}
          </div>
        )}
        {message && (
          <div className="text-muted" style={{ color: "#2563eb" }}>
            {message}
          </div>
        )}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Attendere..." : cta}
        </button>
      </div>
    </form>
  );
}
