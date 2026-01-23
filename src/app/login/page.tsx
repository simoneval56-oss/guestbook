import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function LoginPage() {
  return (
    <div className="grid auth-page auth-page--login" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/">{`<- Torna alla home`}</Link>
        <Link className="btn btn-secondary" href="/register">
          Registrati
        </Link>
      </header>
      <AuthForm mode="login" />
    </div>
  );
}
