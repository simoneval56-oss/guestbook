export type LayoutId =
  | "classico"
  | "moderno"
  | "rustico"
  | "mediterraneo"
  | "pastello"
  | "oro"
  | "illustrativo"
  | "futuristico"
  | "romantico"
  | "notturno";

export type LayoutTemplate = "aurora" | "essenziale" | "boutique";

export type LayoutDefinition = {
  id: LayoutId;
  name: string;
  description: string;
  icon: string;
  template: LayoutTemplate;
  thumbnail?: string;
};

export const LAYOUTS: LayoutDefinition[] = [
  {
    id: "classico",
    name: "CLASSICO",
    description: "Un design classico ed elegante.",
    icon: "icon-grid",
    template: "aurora",
    thumbnail: "/layout-thumbs/anteprima-classico.png"
  },
  {
    id: "moderno",
    name: "MODERNO",
    description: "Stile minimal con un look contemporaneo.",
    icon: "icon-list",
    template: "essenziale",
    thumbnail: "/layout-thumbs/anteprima-moderno.png?v=3"
  },
  {
    id: "rustico",
    name: "RUSTICO",
    description: "Un design caldo ed accogliente.",
    icon: "icon-waves",
    template: "essenziale"
  },
  {
    id: "mediterraneo",
    name: "MEDITERRANEO",
    description: "Toni freschi e rilassanti.",
    icon: "icon-sun",
    template: "aurora"
  },
  {
    id: "pastello",
    name: "PASTELLO",
    description: "Un tocco artistico e giocoso.",
    icon: "icon-spark",
    template: "boutique",
    thumbnail: "/layout-thumbs/anteprima-pastello.png"
  },
  {
    id: "oro",
    name: "ORO",
    description: "Un design luminoso e sofisticato.",
    icon: "icon-diamond",
    template: "boutique",
    thumbnail: "/layout-thumbs/anteprima-oro.png"
  },
  {
    id: "illustrativo",
    name: "ILLUSTRATIVO",
    description: "Un layout vivace e dinamico, ricco di colori.",
    icon: "icon-illustrated",
    template: "boutique",
    thumbnail: "/layout-thumbs/anteprima-illustrativo.png"
  },
  {
    id: "futuristico",
    name: "FUTURISTICO",
    description: "Un design innovativo per un effetto ultramoderno.",
    icon: "icon-circuit",
    template: "essenziale"
  },
  {
    id: "romantico",
    name: "ROMANTICO",
    description: "Palette delicate per un'atmosfera da sogno.",
    icon: "icon-heart",
    template: "boutique"
  },
  {
    id: "notturno",
    name: "NOTTURNO",
    description: "Toni scuri, contrasti eleganti.",
    icon: "icon-moon",
    template: "aurora"
  }
];

export const DEFAULT_LAYOUT_ID: LayoutId = "classico";

export function getLayoutById(id: string | null | undefined): LayoutDefinition {
  const normalized = (id ?? "").toLowerCase();
  const found = LAYOUTS.find((layout) => layout.id === normalized);
  return found ?? LAYOUTS[0];
}
