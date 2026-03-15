"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

type RecoveryStatus = "checking" | "ready" | "invalid";

function readHashType() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") ?? "";
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const resolveRecoveryState = async () => {
      const hashType = readHashType();
      const maxAttempts = hashType === "recovery" ? 20 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!active) return;

        if (session) {
          setStatus("ready");
          return;
        }

        if (hashType === "recovery") {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      if (active) {
        setStatus("invalid");
      }
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setStatus("ready");
      }
    });

    resolveRecoveryState();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!password || password.length < 8) {
      setError("La nuova password deve contenere almeno 8 caratteri.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Le password inserite non coincidono.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password
      });
      if (updateError) {
        throw new Error(updateError.message ?? "update_password_failed");
      }

      await supabase.auth.signOut();
      router.replace("/login?password=updated");
      router.refresh();
    } catch (caughtError: any) {
      setError(caughtError?.message ?? "Errore inatteso durante l'aggiornamento della password.");
      setLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="card" style={{ maxWidth: 440, margin: "0 auto" }}>
        <div className="pill">Reset password</div>
        <p className="text-muted" style={{ marginTop: 16 }}>
          Verifica del link in corso...
        </p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="card" style={{ maxWidth: 440, margin: "0 auto" }}>
        <div className="pill">Link non valido</div>
        <p className="text-muted" style={{ marginTop: 16 }}>
          Il link di reset non e&apos; valido oppure e&apos; scaduto. Richiedine uno nuovo per continuare.
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/forgot-password" style={{ color: "#0e4b58", textDecoration: "underline" }}>
            Richiedi un nuovo reset password
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 440, margin: "0 auto" }}>
      <div className="pill">Imposta nuova password</div>
      <div className="grid" style={{ marginTop: 16, gap: 12 }}>
        <label className="grid" style={{ gap: 6 }}>
          <span style={{ color: "var(--brand-dark)" }}>Nuova password</span>
          <input
            required
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            style={inputStyle}
          />
        </label>

        <label className="grid" style={{ gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--brand-dark)" }}>Conferma password</span>
            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
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
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="input"
            style={inputStyle}
          />
        </label>

        {error ? (
          <div className="text-muted" style={{ color: "#fca5a5" }}>
            {error}
          </div>
        ) : null}

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Aggiornamento..." : "Aggiorna password"}
        </button>
      </div>
    </form>
  );
}
