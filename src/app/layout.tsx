import type { Metadata } from "next";
import "./globals.css";
import { getSiteUrl } from "../lib/site-url";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: {
    default: "GuestHomeBook | Homebook digitali per strutture ricettive",
    template: "%s | GuestHomeBook"
  },
  description: "GuestHomeBook: crea homebook digitali per la tua struttura ricettiva. Centralizza regole, informazioni e consigli per gli ospiti.",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/"
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
