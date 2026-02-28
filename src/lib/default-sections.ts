import { LayoutId } from "./layouts";

export type DefaultSectionDefinition = {
  title: string;
  order_index: number;
};

const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function ensureColazioneSection(
  sections: DefaultSectionDefinition[]
): DefaultSectionDefinition[] {
  const hasColazione = sections.some((section) => normalizeTitle(section.title) === "colazione");
  if (hasColazione) return sections;

  const regoleSection = sections.find((section) => normalizeTitle(section.title) === "regole struttura");
  const insertIndex = regoleSection?.order_index ?? sections.length;
  const bumped = sections.map((section) =>
    section.order_index > insertIndex
      ? { ...section, order_index: section.order_index + 1 }
      : { ...section }
  );

  const withColazione: DefaultSectionDefinition[] = [
    ...bumped,
    { title: "Colazione", order_index: insertIndex + 1 }
  ];

  return withColazione.sort((a, b) => a.order_index - b.order_index);
}

const SHARED_SECTIONS: DefaultSectionDefinition[] = [
  { title: "Check-in", order_index: 1 },
  { title: "Come Raggiungerci", order_index: 2 },
  { title: "La Nostra Struttura", order_index: 3 },
  { title: "Funzionamento", order_index: 4 },
  { title: "Regole Struttura", order_index: 5 },
  { title: "Dove Mangiare", order_index: 6 },
  { title: "Dove Bere", order_index: 7 },
  { title: "Cosa Visitare", order_index: 8 },
  { title: "Esperienze", order_index: 9 },
  { title: "Shopping", order_index: 10 },
  { title: "Spiagge", order_index: 11 },
  { title: "Servizi", order_index: 12 },
  { title: "Numeri Utili", order_index: 13 },
  { title: "Check-out", order_index: 14 }
];

const CLASSICO_SECTIONS: DefaultSectionDefinition[] = [
  ...SHARED_SECTIONS.slice(0, 5),
  { title: "Colazione", order_index: 6 },
  ...SHARED_SECTIONS.slice(5).map((section) => ({
    ...section,
    order_index: section.order_index + 1
  }))
];

const PASTELLO_SECTIONS: DefaultSectionDefinition[] = [
  ...SHARED_SECTIONS.slice(0, 5),
  { title: "Colazione", order_index: 6 },
  ...SHARED_SECTIONS.slice(5).map((section) => ({
    ...section,
    order_index: section.order_index + 1
  }))
];

const MODERNO_SECTIONS: DefaultSectionDefinition[] = [
  ...SHARED_SECTIONS.slice(0, 5),
  { title: "Colazione", order_index: 6 },
  ...SHARED_SECTIONS.slice(5).map((section) => ({
    ...section,
    order_index: section.order_index + 1
  }))
];

const ORO_SECTIONS: DefaultSectionDefinition[] = [
  ...SHARED_SECTIONS.slice(0, 5),
  { title: "Colazione", order_index: 6 },
  ...SHARED_SECTIONS.slice(5).map((section) => ({
    ...section,
    order_index: section.order_index + 1
  }))
];

const ILLUSTRATIVO_SECTIONS: DefaultSectionDefinition[] = [
  ...SHARED_SECTIONS.slice(0, 5),
  { title: "Colazione", order_index: 6 },
  ...SHARED_SECTIONS.slice(5).map((section) => ({
    ...section,
    order_index: section.order_index + 1
  }))
];

const DEFAULT_SECTIONS_BY_LAYOUT: Partial<Record<LayoutId, DefaultSectionDefinition[]>> = {
  classico: CLASSICO_SECTIONS,
  moderno: MODERNO_SECTIONS,
  rustico: SHARED_SECTIONS,
  mediterraneo: SHARED_SECTIONS,
  pastello: PASTELLO_SECTIONS,
  oro: ORO_SECTIONS,
  illustrativo: ILLUSTRATIVO_SECTIONS,
  futuristico: SHARED_SECTIONS,
  romantico: SHARED_SECTIONS,
  notturno: SHARED_SECTIONS
};

export function getDefaultSections(layoutType: LayoutId | string | null | undefined): DefaultSectionDefinition[] {
  const normalized = (layoutType ?? "").toLowerCase() as LayoutId;
  const base = DEFAULT_SECTIONS_BY_LAYOUT[normalized] ?? SHARED_SECTIONS;
  return ensureColazioneSection(base);
}
