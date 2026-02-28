export const MEDITERRANEO_ICON_OVERRIDES: Record<string, string> = {
  "check-in": "/Icons/Mediterraneo/check-in.png",
  "come-raggiungerci": "/Icons/Mediterraneo/come-raggiungerci.png",
  "la-nostra-struttura": "/Icons/Mediterraneo/casa.png",
  funzionamento: "/Icons/Mediterraneo/funzionamento.png",
  "regole-struttura": "/Icons/Mediterraneo/regole.png",
  "dove-mangiare": "/Icons/Mediterraneo/ristorante.png",
  "dove-bere": "/Icons/Mediterraneo/bar.png",
  "cosa-visitare": "/Icons/Mediterraneo/cosa-visitare.png",
  esperienze: "/Icons/Mediterraneo/esperienze.png",
  spiagge: "/Icons/Mediterraneo/spiaggia.png?v=2",
  servizi: "/Icons/Mediterraneo/servizi.png",
  "numeri-utili": "/Icons/Mediterraneo/telefono.png",
  "check-out": "/Icons/Mediterraneo/check-out.png",
  shopping: "/Icons/Mediterraneo/shopping.png",
  colazione: "/Icons/Mediterraneo/colazione.png"
};

export function getMediterraneoIconOverride(slug: string) {
  return MEDITERRANEO_ICON_OVERRIDES[slug];
}

export function getMediterraneoIconCandidates(slug: string) {
  const candidates = [
    getMediterraneoIconOverride(slug),
    `/Icons/Mediterraneo/${slug}.png`,
    `/Icons/Mediterraneo/${slug}.svg`
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates));
}
