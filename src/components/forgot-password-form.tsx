"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase/client";

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

function mapResetRequestError(rawMessage: string) {
  if (/rate limit/i.test(rawMessage)) {
    return "Richiesta temporaneamente limitata. Attendi qualche minuto e riprova.";
  }
  return rawMessage || "Errore inatteso";
}

function buildResetRedirectUrl() {
  if (typeof window === "undefined") return "/reset-password";
  return new URL("/reset-password", window.location.origin).toString();
}

export function ForgotPasswordForm() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildResetRedirectUrl()
      });
      if (resetError) {
        throw new Error(mapResetRequestError(resetError.message ?? ""));
      }

      setMessage("Se l'email esiste, ti abbiamo inviato un link per reimpostare la password.");
    } catch (caughtError: any) {
      setError(caughtError?.message ?? "Errore inatteso");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 440, margin: "0 auto" }}>
      <div className="pill">Recupera password</div>
      <div className="grid" style={{ marginTop: 16, gap: 12 }}>
        <label className="grid" style={{ gap: 6 }}>
          <span style={{ color: "var(--brand-dark)" }}>Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input"
            style={inputStyle}
          />
        </label>

        {error ? (
          <div className="text-muted" style={{ color: "#fca5a5" }}>
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="text-muted" style={{ color: "#2563eb" }}>
            {message}
          </div>
        ) : null}

        <button className="btn" type="submit" disabled={loading}>
          {loading ? (
            <span className="btn__loading">
              <span className="btn__spinner" aria-hidden="true" />
              Attendere...
            </span>
          ) : (
            "Invia link di reset"
          )}
        </button>
      </div>
    </form>
  );
}
