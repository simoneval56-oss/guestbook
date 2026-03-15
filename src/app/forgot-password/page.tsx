import Link from "next/link";
import { ForgotPasswordForm } from "../../components/forgot-password-form";
import { LegalLinks } from "../../components/legal-links";

export default function ForgotPasswordPage() {
  return (
    <div className="grid auth-page auth-page--login" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/login">{`<- Torna al login`}</Link>
        <Link className="btn btn-secondary" href="/register">
          Registrati
        </Link>
      </header>
      <ForgotPasswordForm />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <LegalLinks compact justify="center" />
      </div>
    </div>
  );
}
