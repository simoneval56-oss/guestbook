export const RUSTICO_ICON_OVERRIDES: Record<string, string> = {
  "check-in": "/Icons/Rustico/check-in.png",
  "come-raggiungerci": "/Icons/Rustico/come-raggiungerci.png",
  "la-nostra-struttura": "/Icons/Rustico/casa.png",
  funzionamento: "/Icons/Rustico/funzionamento.png",
  "regole-struttura": "/Icons/Rustico/regole.png",
  "dove-mangiare": "/Icons/Rustico/ristorante.png",
  "dove-bere": "/Icons/Rustico/bar.png",
  "cosa-visitare": "/Icons/Rustico/cosa-visitare.png",
  esperienze: "/Icons/Rustico/esperienze.png",
  spiagge: "/Icons/Rustico/spiaggia.png?v=20260212",
  servizi: "/Icons/Rustico/servizi.png",
  "numeri-utili": "/Icons/Rustico/telefono.png",
  "check-out": "/Icons/Rustico/check-out.png",
  shopping: "/Icons/Rustico/shopping.png",
  colazione: "/Icons/Rustico/colazione.png"
};

export function getRusticoIconOverride(slug: string) {
  return RUSTICO_ICON_OVERRIDES[slug];
}

export function getRusticoIconCandidates(slug: string) {
  const candidates = [
    getRusticoIconOverride(slug),
    `/Icons/Rustico/${slug}.png`,
    `/Icons/Rustico/${slug}.svg`
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates));
}
