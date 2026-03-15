import Link from "next/link";
import { ResetPasswordForm } from "../../components/reset-password-form";
import { LegalLinks } from "../../components/legal-links";

export default function ResetPasswordPage() {
  return (
    <div className="grid auth-page auth-page--login" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/login">{`<- Torna al login`}</Link>
        <Link className="btn btn-secondary" href="/register">
          Registrati
        </Link>
      </header>
      <ResetPasswordForm />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <LegalLinks compact justify="center" />
      </div>
    </div>
  );
}
