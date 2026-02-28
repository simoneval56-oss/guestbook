import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string | string[] }>;
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

  return (
    <div className="grid auth-page auth-page--login" style={{ gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/">{`<- Torna alla home`}</Link>
        <Link className="btn btn-secondary" href="/register">
          Registrati
        </Link>
      </header>
      <AuthForm mode="login" redirectTo={redirectTo} />
    </div>
  );
}
