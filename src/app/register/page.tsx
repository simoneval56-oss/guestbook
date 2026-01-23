import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function RegisterPage() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/">{`<- Torna alla home`}</Link>
        <Link className="btn btn-secondary" href="/login">
          Accedi
        </Link>
      </header>
      <AuthForm mode="register" />
    </div>
  );
}
