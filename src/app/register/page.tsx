import Link from "next/link";
import { AuthForm } from "../../components/auth-form";
import { LegalLinks } from "../../components/legal-links";

export default function RegisterPage() {
  return (
    <div className="grid auth-page" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/">{`<- Torna alla home`}</Link>
        <Link className="btn btn-secondary" href="/login">
          Accedi
        </Link>
      </header>
      <AuthForm mode="register" />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <LegalLinks compact justify="center" />
      </div>
    </div>
  );
}
