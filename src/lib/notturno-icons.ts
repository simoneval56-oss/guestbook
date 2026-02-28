export const NOTTURNO_ICON_OVERRIDES: Record<string, string> = {
  "check-in": "/Icons/Notturno/check-in.png",
  "come-raggiungerci": "/Icons/Notturno/indicazioni.png",
  "la-nostra-struttura": "/Icons/Notturno/struttura.png",
  funzionamento: "/Icons/Notturno/funzionamento.png",
  "regole-struttura": "/Icons/Notturno/lista.png",
  colazione: "/Icons/Notturno/colazione.png",
  "dove-mangiare": "/Icons/Notturno/ristorante.png",
  "dove-bere": "/Icons/Notturno/bar1.png",
  "cosa-visitare": "/Icons/Notturno/cosa-visitare.png",
  esperienze: "/Icons/Notturno/esperienze.png",
  shopping: "/Icons/Notturno/shopping.png",
  spiagge: "/Icons/Notturno/spiaggia.png",
  servizi: "/Icons/Notturno/servizi.png",
  "numeri-utili": "/Icons/Notturno/numeri.png",
  "check-out": "/Icons/Notturno/check-out.png"
};

export function getNotturnoIconOverride(slug: string) {
  return NOTTURNO_ICON_OVERRIDES[slug];
}

export function getNotturnoIconCandidates(slug: string) {
  const candidates = [
    getNotturnoIconOverride(slug),
    `/Icons/Notturno/${slug}.png`,
    `/Icons/Notturno/${slug}.svg`
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates));
}
