"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LEGAL_TRIAL_DAYS } from "../lib/legal";
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

function mapRegistrationError(rawMessage: string) {
  if (/rate limit/i.test(rawMessage)) {
    return "Registrazione temporaneamente bloccata per troppi tentativi ravvicinati. Attendi qualche minuto, poi riprova oppure verifica se hai gia ricevuto l'email di conferma.";
  }

  switch (rawMessage) {
    case "legal_acceptance_required":
      return "Per creare l'account devi accettare i Termini di servizio e prendere visione della Privacy.";
    case "missing_credentials":
    case "invalid_request_body":
      return "Inserisci email e password valide per completare la registrazione.";
    case "profile_setup_failed":
      return "Registrazione non completata per un errore tecnico interno. Riprova tra poco.";
    case "signup_rate_limited":
      return "Registrazione temporaneamente bloccata per troppi tentativi ravvicinati. Attendi qualche minuto, poi riprova oppure verifica se hai gia ricevuto l'email di conferma.";
    default:
      return rawMessage || "Errore inatteso";
  }
}

export function AuthForm({ mode, redirectTo }: AuthFormProps) {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const safeRedirectPath = sanitizeRedirectPath(redirectTo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptLegal, setAcceptLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setError(null);
    setMessage(null);
    setAcceptLegal(false);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "register") {
        if (!acceptLegal) {
          throw new Error("legal_acceptance_required");
        }

        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password,
            redirectTo: safeRedirectPath,
            acceptLegal: true
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(mapRegistrationError(payload?.error ?? ""));
        }

        if (payload?.needsEmailConfirmation) {
          setPassword("");
          setMessage("Ti abbiamo inviato un link di conferma via email. Aprilo e poi accedi con le tue credenziali.");
          return;
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

        {mode === "register" ? (
          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              color: "#36505a",
              lineHeight: 1.6,
              fontSize: 13
            }}
          >
            <input
              type="checkbox"
              checked={acceptLegal}
              onChange={(e) => setAcceptLegal(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              Ho letto e accetto i{" "}
              <Link href="/termini" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Termini di servizio
              </Link>{" "}
              e dichiaro di aver preso visione della{" "}
              <Link href="/privacy" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Privacy
              </Link>
              . Per il funzionamento del servizio consulta anche{" "}
              <Link href="/cookie" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Cookie
              </Link>{" "}
              e{" "}
              <Link href="/recesso" style={{ color: "#0e4b58", textDecoration: "underline" }}>
                Recesso
              </Link>
              .
            </span>
          </label>
        ) : null}

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

        {mode === "register" ? (
          <p style={{ margin: 0, color: "#5b6d76", fontSize: 13, lineHeight: 1.65 }}>
            Creando un account avvii la prova gratuita di {LEGAL_TRIAL_DAYS} giorni. Salviamo anche data e versione
            dei documenti accettati per poter dimostrare il consenso associato all&apos;account.
          </p>
        ) : null}
      </div>
    </form>
  );
}
