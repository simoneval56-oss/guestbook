import Link from "next/link";
import type { ReactNode } from "react";
import {
  LEGAL_BRAND_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_MAILTO,
  LEGAL_LAST_UPDATED_LABEL
} from "../lib/legal";
import { LegalLinks } from "./legal-links";

type LegalPageSection = {
  id: string;
  title: string;
  body: ReactNode;
};

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: LegalPageSection[];
};

export function LegalPageShell({ eyebrow, title, intro, sections }: LegalPageShellProps) {
  return (
    <div className="grid" style={{ gap: 20, maxWidth: 980, margin: "0 auto", padding: "24px 0 56px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap"
        }}
      >
        <Link href="/">{`<- Torna alla home`}</Link>
        <LegalLinks compact />
      </header>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div className="pill">{eyebrow}</div>
        <div className="grid" style={{ gap: 12 }}>
          <h1 style={{ margin: 0, color: "#0e4b58" }}>{title}</h1>
          <div style={{ color: "#36505a", lineHeight: 1.75 }}>{intro}</div>
          <p style={{ margin: 0, color: "#6b7e86", fontSize: 13 }}>
            Ultimo aggiornamento: {LEGAL_LAST_UPDATED_LABEL}
          </p>
        </div>
      </section>

      <div className="grid" style={{ gap: 16 }}>
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="card" style={{ display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0, color: "#0e4b58", fontSize: 24 }}>{section.title}</h2>
            <div style={{ color: "#36505a", lineHeight: 1.75 }}>{section.body}</div>
          </section>
        ))}
      </div>

      <section className="card" style={{ display: "grid", gap: 10 }}>
        <div className="pill">Contatti</div>
        <p style={{ margin: 0, color: "#36505a", lineHeight: 1.75 }}>
          Per richieste relative a privacy, abbonamenti, recesso, cancellazione account o esercizio dei diritti
          puoi scrivere a{" "}
          <a href={LEGAL_CONTACT_MAILTO} style={{ color: "#0e4b58", textDecoration: "underline" }}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Nei documenti di questa area, {LEGAL_BRAND_NAME} indica il sito e il servizio digitale raggiungibile
          tramite guesthomebook.it.
        </p>
      </section>
    </div>
  );
}
