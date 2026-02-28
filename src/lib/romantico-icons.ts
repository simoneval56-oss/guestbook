export const ROMANTICO_ICON_OVERRIDES: Record<string, string> = {
  "check-in": "/Icons/Romantico/check-in.png?v=2",
  "come-raggiungerci": "/Icons/Romantico/come-raggiungerci1.png?v=2",
  "la-nostra-struttura": "/Icons/Romantico/casa.png?v=2",
  "regole-struttura": "/Icons/Romantico/inventario.png?v=2",
  "dove-mangiare": "/Icons/Romantico/ristorante.png?v=2",
  "dove-bere": "/Icons/Romantico/bar.png?v=2",
  esperienze: "/Icons/Romantico/come-raggiungerci.png?v=2",
  spiagge: "/Icons/Romantico/spiaggia.png?v=2",
  "numeri-utili": "/Icons/Romantico/Telefono.png?v=2",
  "check-out": "/Icons/Romantico/chiavi1.png?v=2"
};

export function getRomanticoIconOverride(slug: string) {
  return ROMANTICO_ICON_OVERRIDES[slug];
}

export function getRomanticoIconCandidates(slug: string) {
  const candidates = [
    getRomanticoIconOverride(slug),
    `/Icons/Romantico/${slug}.png`,
    `/Icons/Romantico/${slug}.svg`
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates));
}
