export const FUTURISTICO_ICON_OVERRIDES: Record<string, string> = {
  "check-in": "/Icons/Futuristico/check-in1.png?v=1",
  "come-raggiungerci": "/Icons/Futuristico/come-raggiungerci.png?v=1",
  "la-nostra-struttura": "/Icons/Futuristico/struttura.png?v=1",
  funzionamento: "/Icons/Futuristico/funzionamento1.png?v=1",
  "dove-mangiare": "/Icons/Futuristico/ristorante.png?v=1",
  "dove-bere": "/Icons/Futuristico/bar.png?v=1",
  spiagge: "/Icons/Futuristico/spiaggia.png?v=1",
  "numeri-utili": "/Icons/Futuristico/telefono.png?v=1",
  "regole-struttura": "/Icons/Futuristico/funzionamento.png?v=1"
};

export function getFuturisticoIconOverride(slug: string) {
  return FUTURISTICO_ICON_OVERRIDES[slug];
}

export function getFuturisticoIconCandidates(slug: string) {
  const candidates = [
    getFuturisticoIconOverride(slug),
    `/Icons/Futuristico/${slug}.png`,
    `/Icons/Futuristico/${slug}.svg`
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates));
}
