import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/cookie", label: "Cookie" },
  { href: "/termini", label: "Termini" },
  { href: "/recesso", label: "Recesso" }
] as const;

type LegalLinksProps = {
  compact?: boolean;
  justify?: "flex-start" | "center" | "flex-end";
};

export function LegalLinks({ compact = false, justify = "flex-start" }: LegalLinksProps) {
  return (
    <nav
      aria-label="Link legali"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: compact ? 12 : 16,
        justifyContent: justify
      }}
    >
      {LEGAL_LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          style={{
            color: "#0e4b58",
            textDecoration: "underline",
            fontSize: compact ? 13 : 14,
            fontWeight: 600
          }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
