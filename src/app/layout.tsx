import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homebook Studio",
  description: "Crea homebook digitali per le tue strutture ricettive"
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
