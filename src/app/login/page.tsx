import Link from "next/link";
import { AuthForm } from "../../components/auth-form";
import { LegalLinks } from "../../components/legal-links";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
    password?: string | string[];
    verification?: string | string[];
    email?: string | string[];
  }>;
};

function sanitizeRedirectPath(value: string | undefined) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawNext = resolvedSearchParams?.next;
  const nextValue = Array.isArray(rawNext) ? rawNext[0] : rawNext;
  const redirectTo = sanitizeRedirectPath(nextValue);
  const rawPasswordStatus = resolvedSearchParams?.password;
  const passwordStatus = Array.isArray(rawPasswordStatus) ? rawPasswordStatus[0] : rawPasswordStatus;
  const rawVerification = resolvedSearchParams?.verification;
  const verificationStatus = Array.isArray(rawVerification) ? rawVerification[0] : rawVerification;
  const isVerificationPending = verificationStatus === "pending";
  const rawEmail = resolvedSearchParams?.email;
  const prefilledEmail = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;

  return (
    <div className="grid auth-page auth-page--login" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/">{`<- Torna alla home`}</Link>
        <Link className="btn btn-secondary" href="/register">
          Registrati
        </Link>
      </header>
      {passwordStatus === "updated" ? (
        <div
          className="card"
          style={{
            maxWidth: 440,
            margin: "0 auto",
            border: "1px solid #b7ebc6",
            background: "#f0fff4",
            color: "#14532d"
          }}
        >
          Password aggiornata correttamente. Accedi con la nuova password.
        </div>
      ) : null}
      {isVerificationPending ? (
        <div
          className="card"
          style={{
            maxWidth: 440,
            margin: "0 auto",
            border: "1px solid #f3b0b0",
            background: "#fff1f1",
            color: "#8b1b1b"
          }}
        >
          Conferma prima la registrazione dalla mail ricevuta. Fino a conferma avvenuta, login e password restano
          bloccati.
        </div>
      ) : null}
      <AuthForm
        mode="login"
        redirectTo={redirectTo}
        lockLoginUntilVerification={isVerificationPending}
        prefilledEmail={prefilledEmail}
      />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <LegalLinks compact justify="center" />
      </div>
    </div>
  );
}
