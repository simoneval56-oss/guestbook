"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase/client";
import { getRomanticoIconCandidates } from "../lib/romantico-icons";
import { getFuturisticoIconCandidates } from "../lib/futuristico-icons";
import { getNotturnoIconCandidates } from "../lib/notturno-icons";
import { ATTACHMENT_FILE_ACCEPT, MEDIA_FILE_ACCEPT, validateUploadCandidate } from "../lib/upload-limits";

export type Section = {
  id: string;
  title: string;
  order_index: number;
  visible: boolean | null;
};

export type Subsection = {
  id: string;
  content_text: string | null;
  visible: boolean | null;
  order_index?: number | null;
  created_at: string | null;
};

export type MediaItem = {
  id: string;
  section_id?: string | null;
  subsection_id?: string | null;
  url: string;
  type: string;
  order_index?: number | null;
  description?: string | null;
};

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSearchValue(value: string) {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const tokens = base.replace(/[^a-z0-9]+/g, " ").trim();
  const compact = tokens.replace(/\s+/g, "");
  return { tokens, compact };
}

function matchesSearchValue(text: string, queryTokens: string[], queryCompact: string) {
  if (!queryTokens.length && !queryCompact) return true;
  const normalized = normalizeSearchValue(text);
  if (!normalized.tokens && !normalized.compact) return false;
  if (
    queryTokens.length &&
    queryTokens.every((token) => normalized.tokens.includes(token) || normalized.compact.includes(token))
  ) {
    return true;
  }
  return queryCompact ? normalized.compact.includes(queryCompact) : false;
}

const SUBSECTION_ORDER_RAW: Record<string, string[]> = {
  "check-in": ["Prima di partire", "Orario", "Formalita", "Self check-in", "Check-in in presenza"],
  "come raggiungerci": ["Auto", "Aereo", "Bus", "Traghetto", "Metro", "Treno", "Noleggio"],
  "la nostra struttura": [
    "La casa",
    "Cucina",
    "Terrazza",
    "Giardino",
    "Piscina",
    "Camera da letto",
    "Soggiorno",
    "Bagno"
  ],
  "funzionamento": ["Accesso struttura", "Parcheggio", "Biancheria", "Rifiuti", "Wi-Fi", "Climatizzatore", "Riscaldamento"],
  "colazione": ["Colazione"],
  "regole struttura": [
    "Check-in",
    "Check-out",
    "Vietato fumare",
    "Silenzio e buon vicinato",
    "Accesso altri ospiti",
    "Animali",
    "Documenti",
    "Chiavi della casa",
    "Inventario",
    "Pulizie"
  ],
  "numeri utili": ["Accoglienza", "Guardia medica", "Farmacia", "Ambulanza", "Polizia", "Vigili del fuoco", "Taxi"],
  "check-out": ["Orario", "Pulizie", "Inventario", "Chiavi"]
};

const SUBSECTION_ORDER_BY_SECTION: Record<string, string[]> = Object.fromEntries(
  Object.entries(SUBSECTION_ORDER_RAW).map(([section, subs]) => [
    normalizeKey(section),
    subs.map((sub) => normalizeKey(sub))
  ])
);

function parseSubContent(raw: string | null | undefined) {
  const safe = raw ?? "";
  try {
    const parsed = JSON.parse(safe);
    if (parsed && typeof parsed.title === "string" && typeof parsed.body === "string") {
      return { title: parsed.title, body: parsed.body };
    }
  } catch (e) {
    // ignore parsing errors
  }
  const title = safe.trim().split("\n")[0] || safe;
  return { title, body: safe };
}

function normalizeHref(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getAttachmentLabel(item: MediaItem) {
  const description = item.description?.trim();
  if (description) return description;
  const raw = item.url.split("?")[0] || "";
  const fallback = raw.split("/").pop() || "Allegato";
  try {
    return decodeURIComponent(fallback);
  } catch {
    return fallback;
  }
}

type IconKey =
  | "check-in"
  | "la nostra struttura"
  | "regole struttura"
  | "colazione"
  | "dove bere"
  | "esperienze"
  | "come raggiungerci"
  | "funzionamento"
  | "dove mangiare"
  | "cosa visitare"
  | "shopping"
  | "spiagge"
  | "servizi"
  | "numeri utili"
  | "check-out";

type LayoutVariantFlags = {
  isModerno?: boolean;
  isIllustrativo?: boolean;
  isPastello?: boolean;
  isOro?: boolean;
  isRustico?: boolean;
  rusticoFolder?: RusticoLikeFolder;
};

type RusticoLikeFolder = "Rustico" | "Mediterraneo";

function getRusticoLikeIconPath(folder: RusticoLikeFolder | undefined, fileName: string) {
  const resolvedFolder = folder ?? "Rustico";
  if (resolvedFolder === "Rustico" && fileName === "giardino.png") {
    return `/Icons/${resolvedFolder}/giardino.png?v=2`;
  }
  if (resolvedFolder === "Mediterraneo") {
    if (fileName === "documenti.png") return `/Icons/${resolvedFolder}/DOCUMENTI.png`;
    if (fileName === "letto.png") return `/Icons/${resolvedFolder}/lettoclip.png`;
    if (fileName === "climatizzatore.png") return `/Icons/${resolvedFolder}/condizionatore.png`;
    if (fileName === "giardino.png") return `/Icons/${resolvedFolder}/giardino.png?v=2`;
    if (fileName === "spiaggia.png") return `/Icons/${resolvedFolder}/spiaggia.png?v=2`;
  }
  return `/Icons/${resolvedFolder}/${fileName}`;
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug || fallback;
}

function RomanticoIcon({
  slug,
  fallback,
  isModerno = false
}: {
  slug: string;
  fallback: ReactNode;
  isModerno?: boolean;
}) {
  const candidates = useMemo(() => getRomanticoIconCandidates(slug), [slug]);
  const [iconIndex, setIconIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const iconSrc = candidates[iconIndex] ?? "";
  const hasThickerStroke = slug === "check-in" || slug === "come-raggiungerci" || slug === "la-nostra-struttura";
  const className = `classico-card__icon-img${hasThickerStroke ? " icon-thicker" : ""}${isModerno ? " icon-bolder" : ""}`;
  const candidatesKey = candidates.join("|");

  useEffect(() => {
    setIconIndex(0);
    setHasError(false);
  }, [candidatesKey]);

  if (!iconSrc || hasError) return <>{fallback}</>;

  return (
    <img
      src={iconSrc}
      alt=""
      className={className}
      loading="lazy"
      onError={() => {
        const nextIndex = iconIndex + 1;
        if (nextIndex < candidates.length) {
          setIconIndex(nextIndex);
        } else {
          setHasError(true);
        }
      }}
    />
  );
}

function FuturisticoIcon({
  slug,
  fallback,
  isModerno = false
}: {
  slug: string;
  fallback: ReactNode;
  isModerno?: boolean;
}) {
  const candidates = useMemo(() => getFuturisticoIconCandidates(slug), [slug]);
  const [iconIndex, setIconIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const iconSrc = candidates[iconIndex] ?? "";
  const hasThickerStroke = slug === "check-in" || slug === "come-raggiungerci" || slug === "la-nostra-struttura";
  const className = `classico-card__icon-img${hasThickerStroke ? " icon-thicker" : ""}${isModerno ? " icon-bolder" : ""}`;
  const candidatesKey = candidates.join("|");

  useEffect(() => {
    setIconIndex(0);
    setHasError(false);
  }, [candidatesKey]);

  if (!iconSrc || hasError) return <>{fallback}</>;

  return (
    <img
      src={iconSrc}
      alt=""
      className={className}
      loading="lazy"
      onError={() => {
        const nextIndex = iconIndex + 1;
        if (nextIndex < candidates.length) {
          setIconIndex(nextIndex);
        } else {
          setHasError(true);
        }
      }}
    />
  );
}

function NotturnoIcon({
  slug,
  fallback,
  isModerno = false
}: {
  slug: string;
  fallback: ReactNode;
  isModerno?: boolean;
}) {
  const candidates = useMemo(() => getNotturnoIconCandidates(slug), [slug]);
  const [iconIndex, setIconIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const iconSrc = candidates[iconIndex] ?? "";
  const hasThickerStroke = slug === "check-in" || slug === "come-raggiungerci" || slug === "la-nostra-struttura";
  const className = `classico-card__icon-img${hasThickerStroke ? " icon-thicker" : ""}${isModerno ? " icon-bolder" : ""}`;
  const candidatesKey = candidates.join("|");

  useEffect(() => {
    setIconIndex(0);
    setHasError(false);
  }, [candidatesKey]);

  if (!iconSrc || hasError) return <>{fallback}</>;

  return (
    <img
      src={iconSrc}
      alt=""
      className={className}
      loading="lazy"
      onError={() => {
        const nextIndex = iconIndex + 1;
        if (nextIndex < candidates.length) {
          setIconIndex(nextIndex);
        } else {
          setHasError(true);
        }
      }}
    />
  );
}

function CheckInImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "check-in.png")
    : isPastello
    ? "/Icons/Pastello/check-in-1.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/campanella.png"
    : isModerno
    ? "/Icons/Moderno/check-in.png?v=1"
    : isOro
    ? "/Icons/Oro/check-in.png"
    : "/Icons/Classico/check-in-3.png?v=1";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  const style = isModerno
    ? undefined
    : { transform: "scale(1.25)", transformOrigin: "center" as const };
  return (
    <img
      src={src}
      alt=""
      className={className}
      style={style}
      loading="lazy"
    />
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3l18 18" />
      <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
      <path d="M9.88 4.24a9.64 9.64 0 0 1 2.12-.24c7 0 11 7 11 7a15.77 15.77 0 0 1-3.1 3.95" />
      <path d="M6.61 6.61C3.87 8.07 2 12 2 12a15.7 15.7 0 0 0 5.06 5.94" />
    </svg>
  );
}

function ComeRaggiungerciImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "come-raggiungerci.png")
    : isPastello
    ? "/Icons/Pastello/come-raggiungerci.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/arrivo.png"
    : isModerno
    ? "/Icons/Moderno/indicazioni.png?v=1"
    : isOro
    ? "/Icons/Oro/come-raggiungerci.png"
    : "/Icons/Classico/come-raggiungerci.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function LaNostraStrutturaImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "casa.png")
    : isPastello
    ? "/Icons/Pastello/struttura.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/struttura.png"
    : isOro
    ? "/Icons/Oro/struttura.png"
    : isModerno
    ? "/Icons/Moderno/struttura.png?v=1"
    : "/Icons/Classico/struttura.png?v=1";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function FunzionamentoImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "funzionamento.png")
    : isPastello
    ? "/Icons/Pastello/funzionamento.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/scheda.png"
    : isOro
    ? "/Icons/Oro/funzionamento.png"
    : isModerno
    ? "/Icons/Moderno/funzionamento.png?v=1"
    : "/Icons/Classico/funzionamento.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function RegoleImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "regole.png")
    : isPastello
    ? "/Icons/Pastello/regole.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/lista-1.png"
    : isOro
    ? "/Icons/Oro/regole.png"
    : isModerno
    ? "/Icons/Moderno/regole.png?v=1"
    : "/Icons/Classico/regole.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function DoveMangiareImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "ristorante.png")
    : isPastello
    ? "/Icons/Pastello/ristorante.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/ristorante.png"
    : isOro
    ? "/Icons/Oro/ristorante.png"
    : isModerno
    ? "/Icons/Moderno/ristorante.png?v=1"
    : "/Icons/Classico/ristorante.png?v=1";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function ColazioneImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "colazione.png")
    : isPastello
    ? "/Icons/Pastello/colazione.png?v=4"
    : isIllustrativo
    ? "/Icons/Illustrativo/colazione.png?v=2"
    : isOro
    ? "/Icons/Oro/colazione.png?v=2"
    : isModerno
    ? "/Icons/Moderno/colazione.png?v=2"
    : "/Icons/Classico/colazione.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function DoveBereImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "bar.png")
    : isPastello
    ? "/Icons/Pastello/pub.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/bar.png"
    : isOro
    ? "/Icons/Oro/bar.png"
    : isModerno
    ? "/Icons/Moderno/bar.png?v=1"
    : "/Icons/Classico/pub.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return <img src={src} alt="" className={className} loading="lazy" />;
}

function CosaVisitareImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "cosa-visitare.png")
    : isPastello
    ? "/Icons/Pastello/cosa-visitare.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/mappamondo.png"
    : isOro
    ? "/Icons/Oro/posiszione.png"
    : isModerno
    ? "/Icons/Moderno/visitare.png?v=1"
    : "/Icons/Classico/esperienze.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function EsperienzeImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "esperienze.png")
    : isPastello
    ? "/Icons/Pastello/esperienze-1.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/fotocamera.png"
    : isOro
    ? "/Icons/Oro/esperienze.png"
    : isModerno
    ? "/Icons/Moderno/esperienze.png?v=1"
    : "/Icons/Classico/cosa-visitare.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return (
    <img src={src} alt="" className={className} loading="lazy" />
  );
}

function ShoppingImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "shopping.png")
    : isPastello
    ? "/Icons/Pastello/negozio.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/negozio.png"
    : isOro
    ? "/Icons/Oro/shopping.png"
    : isModerno
    ? "/Icons/Moderno/shopping.png?v=1"
    : "/Icons/Classico/shopping.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return <img src={src} alt="" className={className} loading="lazy" />;
}

function SpiaggeImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "spiaggia.png")
    : isPastello
    ? "/Icons/Pastello/spiaggia.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/spiaggia.png"
    : isOro
    ? "/Icons/Oro/spiagge.png"
    : isModerno
    ? "/Icons/Moderno/spiaggia.png?v=1"
    : "/Icons/Classico/spiaggia.png?v=1";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return <img src={src} alt="" className={className} loading="lazy" />;
}

function ServiziImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "servizi.png")
    : isPastello
    ? "/Icons/Pastello/servizi.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/servizi.png"
    : isOro
    ? "/Icons/Oro/servizi.png"
    : isModerno
    ? "/Icons/Moderno/servizi.png?v=1"
    : "/Icons/Classico/servizi.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return <img src={src} alt="" className={className} loading="lazy" />;
}

function NumeriUtiliImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "telefono.png")
    : isPastello
    ? "/Icons/Pastello/telefono.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/telefono.png"
    : isOro
    ? "/Icons/Oro/telefono.png"
    : isModerno
    ? "/Icons/Moderno/telefono.png?v=1"
    : "/Icons/Classico/telefono.png";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return <img src={src} alt="" className={className} loading="lazy" />;
}

function CheckOutImg({
  isModerno = false,
  isIllustrativo = false,
  isPastello = false,
  isOro = false,
  isRustico = false,
  rusticoFolder = "Rustico"
}: LayoutVariantFlags = {}) {
  const src = isRustico
    ? getRusticoLikeIconPath(rusticoFolder, "check-out.png")
    : isPastello
    ? "/Icons/Pastello/check-out.png"
    : isIllustrativo
    ? "/Icons/Illustrativo/check-out.png"
    : isOro
    ? "/Icons/Oro/check-out.png"
    : isModerno
    ? "/Icons/Moderno/check-out.png?v=1"
    : "/Icons/Classico/check-out-1png.png?v=1";
  const className = `classico-card__icon-img icon-thicker${isModerno ? " icon-bolder" : ""}`;
  return <img src={src} alt="" className={className} loading="lazy" />;
}

const ICONS: Record<IconKey, JSX.Element> = {
  "check-in": (
    <CheckInImg />
  ),
  "la nostra struttura": <LaNostraStrutturaImg />,
  "regole struttura": <RegoleImg />,
  colazione: <ColazioneImg />,
  "dove bere": <DoveBereImg />,
  esperienze: <EsperienzeImg />,
  "come raggiungerci": <ComeRaggiungerciImg />,
  funzionamento: <FunzionamentoImg />,
  "dove mangiare": <DoveMangiareImg />,
  "cosa visitare": <CosaVisitareImg />,
  shopping: <ShoppingImg />,
  spiagge: <SpiaggeImg />,
  servizi: <ServiziImg />,
  "numeri utili": <NumeriUtiliImg />,
  "check-out": <CheckOutImg />
};

function normalizeTitle(title: string): IconKey | null {
  const key = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim() as IconKey;
  const keyDashed = key.replace(/\s+/g, "-");
  if (keyDashed.includes("check-in") || keyDashed.includes("checkin")) return "check-in";
  if (key.includes("la nostra stuttura")) return "la nostra struttura";
  return (Object.keys(ICONS) as IconKey[]).find((k) => key.includes(k)) ?? null;
}

function resolveRusticoSubsectionIcon({
  sectionNormalized,
  normalized,
  normalizedKey,
  normalizedNoHyphen,
  isTrainSubsection,
  iconFolder = "Rustico"
}: {
  sectionNormalized: string;
  normalized: string;
  normalizedKey: string;
  normalizedNoHyphen: string;
  isTrainSubsection: boolean;
  iconFolder?: RusticoLikeFolder;
}) {
  const has = (value: string) => normalized.includes(value);
  const icon = (fileName: string) => getRusticoLikeIconPath(iconFolder, fileName);

  if (sectionNormalized.includes("check-in")) {
    if (has("prima di partire")) return icon("valigia.png");
    if (normalizedKey === "formalita" || normalizedKey === "formalit") return icon("documenti1.png");
    if (normalizedNoHyphen.includes("self check in")) return icon("self-check-in.png");
    if (has("check-in in presenza") || normalizedNoHyphen.includes("check in in presenza")) {
      return icon("check-in-di-persona.png");
    }
    if (has("orario")) return icon("orario.png");
    if (has("accoglienza")) return icon("accoglienza.png");
    if (has("documenti")) return icon("documenti.png");
  }

  if (sectionNormalized.includes("regole struttura")) {
    if (normalized === "check-in") return icon("check-in-di-persona.png");
    if (normalized === "check-out") return icon("check-out.png");
    if (has("fumare")) return icon("sigaretta.png");
    if (has("silenzio")) return icon("musica.png");
    if (has("ospiti") || has("accesso altri ospiti")) return icon("ospiti.png");
    if (has("animali")) return icon("animali.png");
    if (has("documenti")) return icon("documenti.png");
    if (has("chiavi")) return icon("chiavi.png");
    if (has("inventario")) return icon("inventario.png");
    if (has("pulizia") || has("pulizie")) return icon("pulizia.png");
  }

  if (sectionNormalized.includes("check-out")) {
    if (has("chiavi")) return icon("chiavi1.png");
    if (has("pulizia") || has("pulizie")) return icon("pulizia1.png");
    if (has("inventario")) return icon("lista.png");
    if (has("orario")) return icon("check-out1.png");
    if (has("check-out") || normalizedKey === "checkout") return icon("check-out.png");
  }

  if (sectionNormalized.includes("funzionamento")) {
    if (has("accesso")) return icon("accesso.png");
    if (has("parcheggio")) return icon("parcheggio.png");
    if (has("biancheria")) return icon("biancheria.png");
    if (has("rifiuti")) return icon("rifiuti.png");
    if (has("wi-fi") || has("wifi")) return icon("wi-fi.png");
    if (has("climatizzatore") || has("condizionatore")) return icon("condizionatore.png");
    if (has("riscaldamento")) return icon("riscaldamento.png");
  }

  if (sectionNormalized.includes("come raggiungerci")) {
    if (has("auto")) return icon("auto.png");
    if (has("aereo")) return icon("aereo.png");
    if (has("bus")) return icon("bus.png");
    if (has("metro")) return icon("metro.png");
    if (has("traghetto")) return icon("traghetti.png");
    if (has("noleggio")) return icon("noleggio.png");
    if (isTrainSubsection || has("treno")) return icon("treno.png");
  }

  if (sectionNormalized.includes("numeri utili")) {
    if (has("accoglienza")) return icon("accoglienza.png");
    if (has("taxi")) return icon("taxi.png");
    if (has("polizia")) return icon("polizia.png");
    if (has("guardia medica")) return icon("ospedale.png");
    if (has("ambulanza")) return icon("guardia-medica.png");
    if (has("ospedale")) return icon("ospedale.png");
    if (has("vigili del fuoco") || has("pompieri")) return icon("estintore.png");
    if (has("farmacia")) return icon("farmacia.png");
    return icon("telefono.png");
  }

  if (sectionNormalized.includes("la nostra struttura")) {
    if (has("casa")) return icon("casa.png");
    if (has("cucina")) return icon("cucina.png");
    if (has("terrazza")) return icon("terrazza.png");
    if (has("giardino")) return icon("giardino.png");
    if (has("piscina")) return icon("piscina.png");
    if (has("camera") || has("letto")) return icon("letto.png");
    if (has("soggiorno")) return icon("soggiorno.png");
    if (has("bagno")) return icon("bagno.png");
  }

  if (sectionNormalized.includes("colazione")) {
    return icon("colazione.png");
  }

  if (has("wi-fi") || has("wifi")) return icon("wi-fi.png");

  return null;
}

type ClassicoEditorPreviewProps = {
  sections: Section[];
  subsectionsBySection: Record<string, Subsection[]>;
  mediaByParent: Record<string, MediaItem[]>;
  layoutName?: string;
  readOnly?: boolean;
  homebookId?: string;
  isPublished?: boolean;
  disableLiveMediaFetch?: boolean;
};

export function ClassicoEditorPreview({
  sections,
  subsectionsBySection,
  mediaByParent,
  layoutName = "classico",
  readOnly = false,
  homebookId,
  isPublished,
  disableLiveMediaFetch = false
}: ClassicoEditorPreviewProps) {
  const layoutLabel = layoutName ? layoutName.charAt(0).toUpperCase() + layoutName.slice(1) : "Classico";
  const isClassicLayout = layoutName === "classico";
  const isRusticoLayout = layoutName === "rustico";
  const isMediterraneoLayout = layoutName === "mediterraneo";
  const isRusticoLikeLayout = isRusticoLayout || isMediterraneoLayout;
  const rusticoIconFolder: RusticoLikeFolder = isMediterraneoLayout ? "Mediterraneo" : "Rustico";
  const isModernoLayout = layoutName === "moderno";
  const isIllustrativo = layoutName === "illustrativo";
  const isPastello = layoutName === "pastello";
  const isPastelloLayout = layoutName === "pastello";
  const isOroLayout = layoutName === "oro";
  const isRomanticoLayout = layoutName === "romantico";
  const isFuturisticoLayout = layoutName === "futuristico";
  const isNotturnoLayout = layoutName === "notturno";
  const isModernoLike = isModernoLayout || isIllustrativo;
  const isReadOnly = readOnly;
  const isVisible = (value: boolean | null) => value !== false;
  const rusticoLikeIconProps = { isRustico: isRusticoLikeLayout, rusticoFolder: rusticoIconFolder };

  const renderIconForKey = (iconKey: IconKey) => {
    switch (iconKey) {
      case "check-in":
        return <CheckInImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "come raggiungerci":
        return <ComeRaggiungerciImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "la nostra struttura":
        return <LaNostraStrutturaImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "funzionamento":
        return <FunzionamentoImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "dove mangiare":
        return <DoveMangiareImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "dove bere":
        return <DoveBereImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "regole struttura":
        return <RegoleImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "cosa visitare":
        return <CosaVisitareImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "esperienze":
        return <EsperienzeImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "spiagge":
        return <SpiaggeImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "shopping":
        return <ShoppingImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "servizi":
        return <ServiziImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "colazione":
        return <ColazioneImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "check-out":
        return <CheckOutImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      case "numeri utili":
        return <NumeriUtiliImg isModerno={isModernoLike} isIllustrativo={isIllustrativo} isPastello={isPastello} isOro={isOroLayout} {...rusticoLikeIconProps} />;
      default:
        return ICONS[iconKey];
    }
  };
  const [sectionsState, setSectionsState] = useState<Section[]>(sections.map((s) => ({ ...s, visible: isVisible(s.visible) })));
  const ordered = useMemo(
    () => [...sectionsState].sort((a, b) => a.order_index - b.order_index),
    [sectionsState]
  );
  const sectionsToRender = useMemo(
    () => (isReadOnly ? ordered.filter((section) => isVisible(section.visible)) : ordered),
    [isReadOnly, ordered]
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const activeSection = useMemo(
    () => ordered.find((s) => s.id === activeSectionId) ?? null,
    [activeSectionId, ordered]
  );
  const [subsState, setSubsState] = useState<Record<string, Subsection[]>>(subsectionsBySection);
  const [mediaState, setMediaState] = useState<Record<string, MediaItem[]>>(mediaByParent);
  const [searchTerm, setSearchTerm] = useState("");
  const searchNormalized = useMemo(() => normalizeSearchValue(searchTerm), [searchTerm]);
  const searchTokens = useMemo(
    () => (searchNormalized.tokens ? searchNormalized.tokens.split(" ").filter(Boolean) : []),
    [searchNormalized.tokens]
  );
  const searchEnabled = isReadOnly;
  const filteredSections = useMemo(() => {
    if (!searchEnabled || searchTokens.length === 0) return sectionsToRender;
    return sectionsToRender.filter((section) => {
      const parts: string[] = [section.title];
      const sectionMedia = mediaState[section.id] ?? mediaByParent[section.id] ?? [];
      sectionMedia.forEach((item) => {
        if (item.description) parts.push(item.description);
        if (item.url) parts.push(item.url);
      });
      const sectionSubs = subsState[section.id] ?? [];
      sectionSubs.forEach((sub) => {
        if (isReadOnly && sub.visible === false) return;
        const parsed = parseSubContent(sub.content_text);
        if (parsed.title) parts.push(parsed.title);
        if (parsed.body) parts.push(parsed.body);
        const subMedia = mediaState[sub.id] ?? mediaByParent[sub.id] ?? [];
        subMedia.forEach((item) => {
          if (item.description) parts.push(item.description);
          if (item.url) parts.push(item.url);
        });
      });
      return matchesSearchValue(parts.join(" "), searchTokens, searchNormalized.compact);
    });
  }, [mediaByParent, mediaState, searchEnabled, searchNormalized.compact, searchTokens, sectionsToRender, subsState, isReadOnly]);
  const hasSearch = searchEnabled && searchTokens.length > 0;
  const trimmedSearch = searchTerm.trim();
  const searchStatus = hasSearch
    ? filteredSections.length
      ? `Risultati: ${filteredSections.length}`
      : `Nessun risultato per "${trimmedSearch}"`
    : "";
  const [mediaCommentDrafts, setMediaCommentDrafts] = useState<Record<string, string>>({});
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [mediaDrafts, setMediaDrafts] = useState<Record<string, { url: string; type: "image" | "video" }>>({});
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [uploadDrafts, setUploadDrafts] = useState<Record<string, { file: File; url: string }[]>>({});
  const lastSectionFetchRef = useRef<string | null>(null);
  const activeSubs = useMemo(() => {
    if (!activeSection) return [];
    const sectionKey = normalizeKey(activeSection.title);
    const sectionOrder = SUBSECTION_ORDER_BY_SECTION[sectionKey] ?? [];
    const sectionSubs = subsState[activeSection.id] ?? [];
    const hasManualOrder = sectionSubs.some(
      (sub) => sub.order_index !== null && sub.order_index !== undefined
    );
    const list = [...sectionSubs].sort((a, b) => {
      if (hasManualOrder) {
        const orderA = a.order_index ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.order_index ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
      } else {
        const titleA = normalizeKey(parseSubContent(a.content_text).title);
        const titleB = normalizeKey(parseSubContent(b.content_text).title);
        const orderA = sectionOrder.indexOf(titleA);
        const orderB = sectionOrder.indexOf(titleB);
        const fallbackA = orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA;
        const fallbackB = orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB;
        if (fallbackA !== fallbackB) return fallbackA - fallbackB;
      }
      const timeA = a.created_at ? Date.parse(a.created_at) : 0;
      const timeB = b.created_at ? Date.parse(b.created_at) : 0;
      return timeA - timeB;
    });
    const seen = new Set<string>();
    return list.filter((sub) => {
      const parsed = parseSubContent(sub.content_text);
      const normalizedText = (parsed.title || parsed.body || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
      const key = normalizedText || sub.id || "";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeSection, subsState]);
  const [sectionMediaDrafts, setSectionMediaDrafts] = useState<Record<string, { url: string; type: "link" }>>({});
  const activeSectionSlug = activeSection ? normalizeTitle(activeSection.title)?.replace(/\s+/g, "-") : null;
  const activeSectionIconSlug = activeSectionSlug ?? (activeSection ? slugify(activeSection.title, `sezione-${activeSection.order_index}`) : "");
  const titleSlugClass = activeSectionSlug ? ` classico-editor-modal__title--${activeSectionSlug}` : "";
  const [sectionDrinkLinkDrafts, setSectionDrinkLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [sectionFoodLinkDrafts, setSectionFoodLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [sectionExperienceLinkDrafts, setSectionExperienceLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [sectionShoppingLinkDrafts, setSectionShoppingLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [sectionServiceLinkDrafts, setSectionServiceLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [sectionVisitLinkDrafts, setSectionVisitLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [sectionBeachLinkDrafts, setSectionBeachLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [sectionColazioneLinkDrafts, setSectionColazioneLinkDrafts] = useState<
    Record<string, { url: string; description: string }>
  >({});
  const [uploadingSubId, setUploadingSubId] = useState<string | null>(null);
  const [uploadingAttachmentSubId, setUploadingAttachmentSubId] = useState<string | null>(null);
  const [uploadingAttachmentSectionId, setUploadingAttachmentSectionId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dragInfo, setDragInfo] = useState<{
    parentId: string;
    group: "media" | "link";
    itemId: string;
  } | null>(null);
  const [sectionDragId, setSectionDragId] = useState<string | null>(null);
  const [subDragId, setSubDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const savedFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mediaErrorMessage, setMediaErrorMessage] = useState<string | null>(null);
  const mediaErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMediaRefreshing, setIsMediaRefreshing] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const STORAGE_BUCKET = "homebook-media";
  const [draftMarked, setDraftMarked] = useState(isPublished !== true);

  const markDraftIfNeeded = async () => {
    if (!homebookId || isPublished !== true || draftMarked) return;
    setDraftMarked(true);
    const { error } = await supabase.from("homebooks").update({ is_published: false }).eq("id", homebookId);
    if (error) {
      setDraftMarked(false);
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("homebook:draft", { detail: { homebookId } }));
    }
  };

  const getNextOrderIndex = (parentId: string) => {
    const list = mediaState[parentId] ?? mediaByParent[parentId] ?? [];
    const max = list.reduce((acc, item) => Math.max(acc, item.order_index ?? 0), 0);
    return max + 1;
  };

  const insertMediaItem = async (payload: {
    section_id?: string;
    subsection_id?: string;
    url: string;
    type: string;
    order_index?: number;
    description?: string | null;
  }) => {
    const selectFields = "id, section_id, subsection_id, url, type, order_index, description";
    const attempt = await supabase.from("media").insert(payload).select(selectFields).single();
    if (attempt.error && /order_index/i.test(attempt.error.message || "")) {
      const { order_index, ...fallbackPayload } = payload;
      return await supabase.from("media").insert(fallbackPayload).select(selectFields).single();
    }
    return attempt;
  };

  const showMediaError = (message: string, detail?: string | null) => {
    const suffix = detail ? ` (${detail})` : "";
    setMediaErrorMessage(`${message}${suffix}`);
    if (mediaErrorTimeoutRef.current) {
      clearTimeout(mediaErrorTimeoutRef.current);
    }
    mediaErrorTimeoutRef.current = setTimeout(() => {
      setMediaErrorMessage(null);
    }, 4000);
  };

  const applyMediaUpdate = (
    sectionId: string,
    subIds: string[],
    nextMedia: MediaItem[],
    allowEmpty = false
  ) => {
    setMediaState((prev) => {
      const hasExisting =
        (prev[sectionId]?.length ?? 0) > 0 || subIds.some((subId) => (prev[subId]?.length ?? 0) > 0);
      if (!nextMedia.length && hasExisting && !allowEmpty) {
        return prev;
      }
      const next = { ...prev };
      next[sectionId] = nextMedia.filter((item) => item.section_id === sectionId);
      subIds.forEach((subId) => {
        next[subId] = nextMedia.filter((item) => item.subsection_id === subId);
      });
      return next;
    });
    setMediaCommentDrafts((prev) => {
      const next = { ...prev };
      nextMedia.forEach((item) => {
        next[item.id] = item.description ?? "";
      });
      return next;
    });
  };

  const reorderMediaWithinGroup = (
    parentId: string,
    groupIds: string[],
    fromId: string,
    toId: string
  ) => {
    const fromIndex = groupIds.indexOf(fromId);
    const toIndex = groupIds.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const newGroupIds = [...groupIds];
    newGroupIds.splice(fromIndex, 1);
    newGroupIds.splice(toIndex, 0, fromId);

    const list = mediaState[parentId] ?? mediaByParent[parentId] ?? [];
    const groupSet = new Set(groupIds);
    const groupMap = new Map(list.filter((item) => groupSet.has(item.id)).map((item) => [item.id, item]));
    const reorderedGroupItems = newGroupIds.map((id) => groupMap.get(id)).filter(Boolean) as MediaItem[];
    let cursor = 0;
    const reorderedList = list.map((item) => (groupSet.has(item.id) ? reorderedGroupItems[cursor++] : item));
    const withOrder = reorderedList.map((item, index) => ({ ...item, order_index: index + 1 }));
    setMediaState((prev) => ({ ...prev, [parentId]: withOrder }));

    startTransition(async () => {
      await markDraftIfNeeded();
      await Promise.all(
        withOrder.map((item) =>
          supabase.from("media").update({ order_index: item.order_index }).eq("id", item.id)
                )
      );
    });
  };


  useEffect(() => {
    const normalizedSections = sections.map((s) => ({ ...s, visible: isVisible(s.visible) }));
    const normalizedSubs: Record<string, Subsection[]> = {};
    Object.entries(subsectionsBySection).forEach(([sectionId, list]) => {
      normalizedSubs[sectionId] = list.map((sub) => ({ ...sub, visible: isVisible(sub.visible) }));
    });
    setSectionsState(normalizedSections);
    setSubsState(normalizedSubs);
    const normalizedMedia: Record<string, MediaItem[]> = {};
    Object.entries(mediaByParent).forEach(([parentId, list]) => {
      normalizedMedia[parentId] = [...list].sort(
        (a, b) => (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER)
      );
    });
    setMediaState(normalizedMedia);
    const initialMediaComments: Record<string, string> = {};
    Object.values(normalizedMedia).forEach((items) =>
      items.forEach((item) => {
        initialMediaComments[item.id] = item.description ?? "";
      })
    );
    setMediaCommentDrafts(initialMediaComments);
    const initialTexts: Record<string, string> = {};
    Object.values(subsectionsBySection).forEach((arr) =>
      arr.forEach((sub) => {
        initialTexts[sub.id] = parseSubContent(sub.content_text).body;
      })
    );
    setTextDrafts(initialTexts);
  }, [sections, subsectionsBySection, mediaByParent]);

  useEffect(() => {
    if (!hasSearch || !activeSectionId) return;
    if (!filteredSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(null);
    }
  }, [activeSectionId, filteredSections, hasSearch]);

  useEffect(() => {
    if (isReadOnly || disableLiveMediaFetch) {
      lastSectionFetchRef.current = null;
      return;
    }
    if (!activeSectionId) {
      lastSectionFetchRef.current = null;
      return;
    }
    const sectionSubs = subsState[activeSectionId] ?? [];
    const subIds = sectionSubs.map((sub) => sub.id).filter(Boolean);
    const fetchKey = `${activeSectionId}:${subIds.join(",")}`;
    if (lastSectionFetchRef.current === fetchKey) return;
    lastSectionFetchRef.current = fetchKey;

    let isCancelled = false;
    const fetchMedia = async () => {
      if (homebookId) {
        try {
          const url = `/api/homebooks/${homebookId}/media?section_id=${encodeURIComponent(activeSectionId)}`;
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            if (isCancelled) return;
            showMediaError("Errore nel caricamento dei media. Riprova", detail);
            return;
          }
          const payload = await response.json();
          const data = payload?.data;
          if (!data || !Array.isArray(data.media)) {
            if (isCancelled) return;
            showMediaError("Errore nel caricamento dei media. Riprova");
            return;
          }
          const serverSubIds = Array.isArray(data.subsection_ids)
            ? data.subsection_ids.filter(Boolean)
            : [];
          const fallbackSubIds = (subsState[activeSectionId] ?? []).map((sub) => sub.id).filter(Boolean);
          const resolvedSubIds = serverSubIds.length ? serverSubIds : fallbackSubIds;
          if (isCancelled) return;
          applyMediaUpdate(activeSectionId, resolvedSubIds, data.media);
          return;
        } catch (error) {
          if (isCancelled) return;
          const message = error instanceof Error ? error.message : null;
          showMediaError("Errore nel caricamento dei media. Riprova", message);
          return;
        }
      }

      const selectFields = "id, section_id, subsection_id, url, type, order_index, description, created_at";
      let query = supabase.from("media").select(selectFields);
      if (subIds.length) {
        const orFilters = [`section_id.eq.${activeSectionId}`, `subsection_id.in.(${subIds.join(",")})`];
        query = query.or(orFilters.join(","));
      } else {
        query = query.eq("section_id", activeSectionId);
      }
      const { data, error } = await query.order("order_index", { ascending: true }).order("created_at", { ascending: true });
      if (isCancelled) return;
      if (error) {
        showMediaError("Errore nel caricamento dei media. Riprova", error.message);
        return;
      }
      applyMediaUpdate(activeSectionId, subIds, data ?? []);
    };

    fetchMedia();
    return () => {
      isCancelled = true;
    };
  }, [activeSectionId, disableLiveMediaFetch, homebookId, isReadOnly, subsState, supabase]);

  const refreshMediaForActiveSection = async () => {
    if (!homebookId || !activeSectionId) return;
    setIsMediaRefreshing(true);
    try {
      const url = `/api/homebooks/${homebookId}/media?section_id=${encodeURIComponent(activeSectionId)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        showMediaError("Errore nel caricamento dei media. Riprova", detail);
        return;
      }
      const payload = await response.json();
      const data = payload?.data;
      if (!data || !Array.isArray(data.media)) {
        showMediaError("Errore nel caricamento dei media. Riprova");
        return;
      }
      const serverSubIds = Array.isArray(data.subsection_ids)
        ? data.subsection_ids.filter(Boolean)
        : [];
      const fallbackSubIds = (subsState[activeSectionId] ?? []).map((sub) => sub.id).filter(Boolean);
      const subIds = serverSubIds.length ? serverSubIds : fallbackSubIds;
      applyMediaUpdate(activeSectionId, subIds, data.media);
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      showMediaError("Errore nel caricamento dei media. Riprova", message);
    } finally {
      setIsMediaRefreshing(false);
    }
  };

function parseLinkWithDescription(m: MediaItem) {
  try {
    const parsed = JSON.parse(m.url || "{}");
    if (parsed && typeof parsed.url === "string") {
      const parsedDescription = typeof parsed.description === "string" ? parsed.description : "";
      const description = m.description ?? parsedDescription ?? "";
      return { id: m.id, url: parsed.url, description };
    }
  } catch (e) {
    // ignore
  }
  return { id: m.id, url: m.url, description: m.description ?? "" };
}

  const iconKey = activeSection ? normalizeTitle(activeSection.title) : null;
  const baseModalIcon = iconKey ? renderIconForKey(iconKey) : null;
  const modalIconNode = iconKey && baseModalIcon
    ? isRomanticoLayout
      ? (
        <RomanticoIcon
          slug={activeSectionIconSlug}
          fallback={baseModalIcon}
          isModerno={isModernoLike}
        />
      )
      : isFuturisticoLayout
      ? (
        <FuturisticoIcon
          slug={activeSectionIconSlug}
          fallback={baseModalIcon}
          isModerno={isModernoLike}
        />
      )
      : isNotturnoLayout
      ? (
        <NotturnoIcon
          slug={activeSectionIconSlug}
          fallback={baseModalIcon}
          isModerno={isModernoLike}
        />
      )
      : baseModalIcon
    : baseModalIcon;
  const isColazioneSection = iconKey === "colazione";
  const showStandardSubsections = true;
  const sectionMedia = activeSection ? mediaState[activeSection.id] ?? mediaByParent[activeSection.id] ?? [] : [];
  const sectionLinks = sectionMedia.filter((m) => m.type === "link");
  const foodLinks = iconKey === "dove mangiare" ? sectionLinks.map(parseLinkWithDescription) : [];
  const visitLinks = iconKey === "cosa visitare" ? sectionLinks.map(parseLinkWithDescription) : [];
  const experienceLinks = iconKey === "esperienze" ? sectionLinks.map(parseLinkWithDescription) : [];
  const shoppingLinks = iconKey === "shopping" ? sectionLinks.map(parseLinkWithDescription) : [];
  const serviceLinks = iconKey === "servizi" ? sectionLinks.map(parseLinkWithDescription) : [];
  const beachLinks = iconKey === "spiagge" ? sectionLinks.map(parseLinkWithDescription) : [];
  const drinkLinks = iconKey === "dove bere" ? sectionLinks.map(parseLinkWithDescription) : [];
  const showColazioneSectionExtras =
    isColazioneSection && !isPastelloLayout && !isIllustrativo && !isModernoLayout && !isOroLayout;
  const hideColazioneSubExtras = isColazioneSection && isClassicLayout;
  const colazioneLinks = showColazioneSectionExtras ? sectionLinks.map(parseLinkWithDescription) : [];
  const foodLinkIds = foodLinks.map((item) => item.id);
  const visitLinkIds = visitLinks.map((item) => item.id);
  const experienceLinkIds = experienceLinks.map((item) => item.id);
  const shoppingLinkIds = shoppingLinks.map((item) => item.id);
  const serviceLinkIds = serviceLinks.map((item) => item.id);
  const beachLinkIds = beachLinks.map((item) => item.id);
  const drinkLinkIds = drinkLinks.map((item) => item.id);
  const colazioneLinkIds = colazioneLinks.map((item) => item.id);
  const colazioneAttachments = showColazioneSectionExtras ? sectionMedia.filter((m) => m.type === "file") : [];
  const sectionAttachmentKeys = new Set<IconKey>([
    "dove mangiare",
    "dove bere",
    "cosa visitare",
    "esperienze",
    "shopping",
    "spiagge",
    "servizi"
  ]);
  const showSectionAttachments = iconKey ? sectionAttachmentKeys.has(iconKey) : false;
  const sectionAttachments = showSectionAttachments ? sectionMedia.filter((m) => m.type === "file") : [];
  const isActiveSectionVisible = isVisible(activeSection?.visible ?? null);
  const renderEditorLinkChip = (item: { url: string; description?: string }, key: string) => {
    const href = normalizeHref(item.url);
    return (
      <a key={key} className="classico-editor-modal__chip" href={href} target="_blank" rel="noreferrer">
        Link - {item.url}
      </a>
    );
  };

  const handleDragStart = (
    event: DragEvent<HTMLElement>,
    parentId: string,
    group: "media" | "link",
    itemId: string
  ) => {
    if (isReadOnly) return;
    event.dataTransfer.effectAllowed = "move";
    setDragInfo({ parentId, group, itemId });
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (isReadOnly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (
    event: DragEvent<HTMLElement>,
    parentId: string,
    group: "media" | "link",
    targetId: string,
    groupIds: string[]
  ) => {
    if (isReadOnly) return;
    event.preventDefault();
    if (!dragInfo || dragInfo.parentId !== parentId || dragInfo.group !== group) return;
    reorderMediaWithinGroup(parentId, groupIds, dragInfo.itemId, targetId);
    setDragInfo(null);
  };
  const handleDeleteMedia = (itemId: string, parentId: string) => {
    const confirmed = window.confirm("Vuoi eliminare questo elemento?");
    if (!confirmed) return;
    startTransition(async () => {
      await markDraftIfNeeded();
      const { error } = await supabase.from("media").delete().eq("id", itemId);
      if (!error) {
        setMediaState((prev) => ({
          ...prev,
          [parentId]: (prev[parentId] ?? []).filter((item) => item.id !== itemId)
        }));
        setMediaCommentDrafts((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    });
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!activeSectionId) return false;
    const sectionId = activeSectionId;
    const sectionSubs = subsState[sectionId] ?? [];
    const hasTextChanges = sectionSubs.some((sub) => {
      const parsed = parseSubContent(sub.content_text);
      return (textDrafts[sub.id] ?? "") !== parsed.body;
    });
    const hasMediaDrafts = sectionSubs.some((sub) => {
      const draft = mediaDrafts[sub.id];
      return Boolean(draft?.url?.trim()) || Boolean(uploadDrafts[sub.id]?.length);
    });
    const hasLinkDrafts = sectionSubs.some((sub) => Boolean(linkDrafts[sub.id]?.trim()));
    const hasSectionLinkDraft = Boolean(sectionMediaDrafts[sectionId]?.url?.trim());
    const sectionKey = normalizeTitle(activeSection?.title ?? "");
    const hasSpecialLinkDraft =
      (sectionKey === "dove mangiare" && Boolean(sectionFoodLinkDrafts[sectionId]?.url?.trim())) ||
      (sectionKey === "cosa visitare" && Boolean(sectionVisitLinkDrafts[sectionId]?.url?.trim())) ||
      (sectionKey === "esperienze" && Boolean(sectionExperienceLinkDrafts[sectionId]?.url?.trim())) ||
      (sectionKey === "shopping" && Boolean(sectionShoppingLinkDrafts[sectionId]?.url?.trim())) ||
      (sectionKey === "servizi" && Boolean(sectionServiceLinkDrafts[sectionId]?.url?.trim())) ||
      (sectionKey === "spiagge" && Boolean(sectionBeachLinkDrafts[sectionId]?.url?.trim())) ||
      (sectionKey === "dove bere" && Boolean(sectionDrinkLinkDrafts[sectionId]?.url?.trim())) ||
      (sectionKey === "colazione" && Boolean(sectionColazioneLinkDrafts[sectionId]?.url?.trim()));
    const hasMediaCommentChanges = sectionSubs.some((sub) => {
      const items = mediaState[sub.id] ?? mediaByParent[sub.id] ?? [];
      return items.some((item) => (mediaCommentDrafts[item.id] ?? "") !== (item.description ?? ""));
    });
    const sectionItems = mediaState[sectionId] ?? mediaByParent[sectionId] ?? [];
    const hasSectionMediaCommentChanges = sectionItems.some(
      (item) => (mediaCommentDrafts[item.id] ?? "") !== (item.description ?? "")
    );
    return (
      hasTextChanges ||
      hasMediaDrafts ||
      hasLinkDrafts ||
      hasSectionLinkDraft ||
      hasSpecialLinkDraft ||
      hasMediaCommentChanges ||
      hasSectionMediaCommentChanges
    );
  }, [
    activeSection,
    activeSectionId,
    sectionMediaDrafts,
    sectionFoodLinkDrafts,
    sectionVisitLinkDrafts,
    sectionExperienceLinkDrafts,
    sectionShoppingLinkDrafts,
    sectionServiceLinkDrafts,
    sectionBeachLinkDrafts,
    sectionDrinkLinkDrafts,
    sectionColazioneLinkDrafts,
    subsState,
    textDrafts,
    mediaDrafts,
    linkDrafts,
    uploadDrafts,
    mediaCommentDrafts,
    mediaState,
    mediaByParent
  ]);

  useEffect(() => {
    if (hasUnsavedChanges) {
      setShowSavedFeedback(false);
    }
  }, [hasUnsavedChanges]);

  useEffect(() => {
    return () => {
      if (savedFeedbackTimeoutRef.current) {
        clearTimeout(savedFeedbackTimeoutRef.current);
      }
      if (mediaErrorTimeoutRef.current) {
        clearTimeout(mediaErrorTimeoutRef.current);
      }
    };
  }, []);

  const handleSaveAll = () => {
    if (!activeSectionId) return;
    if (!hasUnsavedChanges) return;
    const sectionId = activeSectionId;
    const sectionSubs = subsState[sectionId] ?? [];
    const sectionKey = normalizeTitle(activeSection?.title ?? "");
    const sectionDraft = sectionMediaDrafts[sectionId];

    startTransition(async () => {
      await markDraftIfNeeded();
      const orderTracker: Record<string, number> = {};
      const nextIndex = (parentId: string) => {
        if (orderTracker[parentId] === undefined) {
          orderTracker[parentId] = getNextOrderIndex(parentId);
        } else {
          orderTracker[parentId] += 1;
        }
        return orderTracker[parentId];
      };
      for (const sub of sectionSubs) {
        const draftValue = textDrafts[sub.id] ?? "";
        const parsed = parseSubContent(sub.content_text);
        if (draftValue !== parsed.body) {
          const payload = JSON.stringify({ title: parsed.title || `Nota`, body: draftValue });
          await supabase.from("subsections").update({ content_text: payload }).eq("id", sub.id);
          setSubsState((prev) => {
            const updated = { ...prev };
            updated[sectionId] = (updated[sectionId] ?? []).map((s) =>
              s.id === sub.id ? { ...s, content_text: payload } : s
            );
            return updated;
          });
        }

        const mediaDraft = mediaDrafts[sub.id];
        const url = mediaDraft?.url?.trim() ?? "";
        if (url) {
          const type = mediaDraft?.type ?? "image";
          const { data, error } = await insertMediaItem({
            subsection_id: sub.id,
            url,
            type,
            order_index: nextIndex(sub.id)
          });
          if (error) {
            showMediaError("Errore nel salvataggio del media. Riprova", error.message);
          }
          if (data) {
            setMediaState((prev) => ({
              ...prev,
              [sub.id]: [...(prev[sub.id] ?? []), data as MediaItem]
            }));
            setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
          }
          setMediaDrafts((prev) => ({ ...prev, [sub.id]: { url: "", type } }));
        }

        const linkDraft = linkDrafts[sub.id]?.trim() ?? "";
        if (linkDraft) {
          const { data, error } = await insertMediaItem({
            subsection_id: sub.id,
            url: linkDraft,
            type: "link",
            order_index: nextIndex(sub.id)
          });
          if (error) {
            showMediaError("Errore nel salvataggio del link. Riprova", error.message);
          }
          if (data) {
            setMediaState((prev) => ({
              ...prev,
              [sub.id]: [...(prev[sub.id] ?? []), data as MediaItem]
            }));
            setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
          }
          setLinkDrafts((prev) => ({ ...prev, [sub.id]: "" }));
        }

        // File uploads are handled immediately on selection.
      }

      if (sectionDraft?.url?.trim()) {
        const { data, error } = await insertMediaItem({
          section_id: sectionId,
          url: sectionDraft.url.trim(),
          type: "link",
          order_index: nextIndex(sectionId)
        });
        if (error) {
          showMediaError("Errore nel salvataggio del link. Riprova", error.message);
        }
        if (data) {
          setMediaState((prev) => ({
            ...prev,
            [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
          }));
          setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        }
        setSectionMediaDrafts((prev) => ({ ...prev, [sectionId]: { url: "", type: "link" } }));
      }

      const specialLinkDrafts = [
        { key: "dove mangiare", draft: sectionFoodLinkDrafts[sectionId] },
        { key: "colazione", draft: sectionColazioneLinkDrafts[sectionId] },
        { key: "cosa visitare", draft: sectionVisitLinkDrafts[sectionId] },
        { key: "esperienze", draft: sectionExperienceLinkDrafts[sectionId] },
        { key: "shopping", draft: sectionShoppingLinkDrafts[sectionId] },
        { key: "servizi", draft: sectionServiceLinkDrafts[sectionId] },
        { key: "spiagge", draft: sectionBeachLinkDrafts[sectionId] },
        { key: "dove bere", draft: sectionDrinkLinkDrafts[sectionId] }
      ];

      for (const entry of specialLinkDrafts) {
        if (entry.key !== sectionKey) continue;
        const draft = entry.draft ?? { url: "", description: "" };
        const linkUrl = draft.url?.trim();
        if (!linkUrl) continue;
        const payload = JSON.stringify({ url: linkUrl, description: draft.description ?? "" });
        const { data, error } = await insertMediaItem({
          section_id: sectionId,
          url: payload,
          type: "link",
          order_index: nextIndex(sectionId),
          description: draft.description ?? null
        });
        if (error) {
          showMediaError("Errore nel salvataggio del link. Riprova", error.message);
        }
        if (data) {
          setMediaState((prev) => ({
            ...prev,
            [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
          }));
          setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        }
        if (sectionKey === "dove mangiare") setSectionFoodLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
        if (sectionKey === "colazione") setSectionColazioneLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
        if (sectionKey === "cosa visitare") setSectionVisitLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
        if (sectionKey === "esperienze") setSectionExperienceLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
        if (sectionKey === "shopping") setSectionShoppingLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
        if (sectionKey === "servizi") setSectionServiceLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
        if (sectionKey === "spiagge") setSectionBeachLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
        if (sectionKey === "dove bere") setSectionDrinkLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }

      const parentIds = [sectionId, ...sectionSubs.map((sub) => sub.id)];
      const commentUpdates: { id: string; description: string | null }[] = [];
      parentIds.forEach((parentId) => {
        const items = mediaState[parentId] ?? mediaByParent[parentId] ?? [];
        items.forEach((item) => {
          const draftValue = (mediaCommentDrafts[item.id] ?? "").trim();
          const currentValue = (item.description ?? "").trim();
          if (draftValue !== currentValue) {
            commentUpdates.push({ id: item.id, description: draftValue || null });
          }
        });
      });

      if (commentUpdates.length) {
        await Promise.all(
          commentUpdates.map((update) =>
            supabase.from("media").update({ description: update.description }).eq("id", update.id)
          )
        );
        const updatesById = new Map(commentUpdates.map((update) => [update.id, update.description ?? ""]));
        setMediaState((prev) => {
          const next = { ...prev };
          parentIds.forEach((parentId) => {
            if (!next[parentId]) return;
            next[parentId] = next[parentId].map((item) =>
              updatesById.has(item.id) ? { ...item, description: updatesById.get(item.id) } : item
            );
          });
          return next;
        });
        setMediaCommentDrafts((prev) => {
          const next = { ...prev };
          commentUpdates.forEach((update) => {
            next[update.id] = update.description ?? "";
          });
          return next;
        });
      }

      if (savedFeedbackTimeoutRef.current) {
        clearTimeout(savedFeedbackTimeoutRef.current);
      }
      setShowSavedFeedback(true);
      savedFeedbackTimeoutRef.current = setTimeout(() => {
        setShowSavedFeedback(false);
      }, 1500);
    });
  };

  const openPreview = (url: string, scopeItems: MediaItem[]) => {
    const images = scopeItems.filter((item) => item.type === "image").map((item) => item.url);
    const startIndex = Math.max(0, images.indexOf(url));
    setPreviewItems(images);
    setPreviewIndex(startIndex);
  };
  const handleSaveText = (subId: string) => {
    const value = textDrafts[subId] ?? "";
    const list = subsState[activeSectionId ?? ""] ?? [];
    const currentSub = list.find((sub) => sub.id === subId);
    const fallbackTitle = `Nota ${Math.max(1, list.findIndex((sub) => sub.id === subId) + 1)}`;
    const baseTitle = parseSubContent(currentSub?.content_text).title || fallbackTitle;
    const currentBody = parseSubContent(currentSub?.content_text).body;
    if (value === currentBody) {
      return;
    }
    const payload = JSON.stringify({ title: baseTitle, body: value });
    startTransition(async () => {
      await markDraftIfNeeded();
      await supabase.from("subsections").update({ content_text: payload }).eq("id", subId);
      setSubsState((prev) => {
        const updated = { ...prev };
        const list = (updated[activeSectionId ?? ""] ?? []).map((s) =>
          s.id === subId ? { ...s, content_text: payload } : s
        );
        if (activeSectionId) updated[activeSectionId] = list;
        return updated;
      });
    });
  };

  const handleToggleSubVisibility = (sectionId: string, subId: string) => {
    const current = subsState[sectionId]?.find((s) => s.id === subId);
    if (!current) return;
    const currentVisible = isVisible(current.visible);
    const nextVisible = !currentVisible;

    setSubsState((prev) => {
      const updated = { ...prev };
      updated[sectionId] = (updated[sectionId] ?? []).map((sub) =>
        sub.id === subId ? { ...sub, visible: nextVisible } : sub
      );
      return updated;
    });

    startTransition(async () => {
      await markDraftIfNeeded();
      const { error } = await supabase.from("subsections").update({ visible: nextVisible }).eq("id", subId);
      if (error) {
        setSubsState((prev) => {
          const rollback = { ...prev };
          rollback[sectionId] = (rollback[sectionId] ?? []).map((sub) =>
            sub.id === subId ? { ...sub, visible: currentVisible } : sub
          );
          return rollback;
        });
      }
    });
  };

  const handleAddMedia = (subId: string, type: "image" | "video") => {
    const draft = mediaDrafts[subId];
    const url = draft?.url?.trim() ?? "";
    if (!url) return;
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        subsection_id: subId,
        url,
        type,
        order_index: getNextOrderIndex(subId)
      });
      if (error) {
        showMediaError("Errore nel salvataggio del media. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [subId]: [...(prev[subId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setMediaDrafts((prev) => ({ ...prev, [subId]: { url: "", type } }));
      }
    });
  };

  const handleUploadMediaFile = async (subId: string, file: File | null | undefined, orderIndex?: number) => {
    if (!file || !file.name || file.size === 0) return;
    const validation = validateUploadCandidate(
      {
        name: file.name,
        size: file.size,
        type: file.type
      },
      "media"
    );
    if (!validation.ok) {
      showMediaError(validation.error);
      return;
    }
    await markDraftIfNeeded();
    try {
      const safeName = file.name.replace(/\s+/g, "-");
      const filePath = `subsections/${subId}/${Date.now()}-${safeName}`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
      if (error || !data?.path) {
        showMediaError("Caricamento file non riuscito. Riprova", error?.message ?? null);
        return;
      }
      const mediaType: "image" | "video" = validation.kind === "video" ? "video" : "image";
      const { data: inserted, error: insertError } = await insertMediaItem({
        subsection_id: subId,
        url: data.path,
        type: mediaType,
        order_index: orderIndex ?? getNextOrderIndex(subId)
      });
      if (insertError || !inserted) {
        showMediaError("Errore nel salvataggio del media. Riprova", insertError?.message ?? null);
        return;
      }
      setMediaState((prev) => ({
        ...prev,
        [subId]: [...(prev[subId] ?? []), inserted as MediaItem]
      }));
      setMediaCommentDrafts((prev) => ({ ...prev, [inserted.id]: inserted.description ?? "" }));
    } finally {
      // caller clears upload state
    }
  };

  const handleUploadMediaFiles = async (subId: string, files: File[]) => {
    if (!files.length) return;
    setUploadingSubId(subId);
    const entries = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    const baseIndex = getNextOrderIndex(subId);
    setUploadDrafts((prev) => ({
      ...prev,
      [subId]: [...(prev[subId] ?? []), ...entries]
    }));
    for (const [index, entry] of entries.entries()) {
      await handleUploadMediaFile(subId, entry.file, baseIndex + index);
      setUploadDrafts((prev) => ({
        ...prev,
        [subId]: (prev[subId] ?? []).filter((item) => item.file !== entry.file)
      }));
      URL.revokeObjectURL(entry.url);
    }
    await refreshMediaForActiveSection();
    setUploadingSubId((current) => (current === subId ? null : current));
  };

  const handleUploadAttachmentFile = async (subId: string, file: File | null | undefined, orderIndex?: number) => {
    if (!file || !file.name || file.size === 0) return;
    const validation = validateUploadCandidate(
      {
        name: file.name,
        size: file.size,
        type: file.type
      },
      "attachment"
    );
    if (!validation.ok) {
      showMediaError(validation.error);
      return;
    }
    await markDraftIfNeeded();
    try {
      const safeName = file.name.replace(/\s+/g, "-");
      const filePath = `subsections/${subId}/attachments/${Date.now()}-${safeName}`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
      if (error || !data?.path) {
        showMediaError("Caricamento allegato non riuscito. Riprova", error?.message ?? null);
        return;
      }
      const { data: inserted, error: insertError } = await insertMediaItem({
        subsection_id: subId,
        url: data.path,
        type: "file",
        order_index: orderIndex ?? getNextOrderIndex(subId),
        description: file.name
      });
      if (insertError || !inserted) {
        showMediaError("Errore nel salvataggio dell'allegato. Riprova", insertError?.message ?? null);
        return;
      }
      setMediaState((prev) => ({
        ...prev,
        [subId]: [...(prev[subId] ?? []), inserted as MediaItem]
      }));
      setMediaCommentDrafts((prev) => ({ ...prev, [inserted.id]: inserted.description ?? "" }));
    } finally {
      // caller clears upload state
    }
  };

  const handleUploadAttachmentFiles = async (subId: string, files: File[]) => {
    if (!files.length) return;
    setUploadingAttachmentSubId(subId);
    const baseIndex = getNextOrderIndex(subId);
    for (const [index, file] of files.entries()) {
      await handleUploadAttachmentFile(subId, file, baseIndex + index);
    }
    await refreshMediaForActiveSection();
    setUploadingAttachmentSubId((current) => (current === subId ? null : current));
  };

  const handleUploadSectionAttachmentFile = async (sectionId: string, file: File | null | undefined, orderIndex?: number) => {
    if (!file || !file.name || file.size === 0) return;
    const validation = validateUploadCandidate(
      {
        name: file.name,
        size: file.size,
        type: file.type
      },
      "attachment"
    );
    if (!validation.ok) {
      showMediaError(validation.error);
      return;
    }
    await markDraftIfNeeded();
    try {
      const safeName = file.name.replace(/\s+/g, "-");
      const filePath = `sections/${sectionId}/attachments/${Date.now()}-${safeName}`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
      if (error || !data?.path) {
        showMediaError("Caricamento allegato non riuscito. Riprova", error?.message ?? null);
        return;
      }
      const { data: inserted, error: insertError } = await insertMediaItem({
        section_id: sectionId,
        url: data.path,
        type: "file",
        order_index: orderIndex ?? getNextOrderIndex(sectionId),
        description: file.name
      });
      if (insertError || !inserted) {
        showMediaError("Errore nel salvataggio dell'allegato. Riprova", insertError?.message ?? null);
        return;
      }
      setMediaState((prev) => ({
        ...prev,
        [sectionId]: [...(prev[sectionId] ?? []), inserted as MediaItem]
      }));
      setMediaCommentDrafts((prev) => ({ ...prev, [inserted.id]: inserted.description ?? "" }));
    } finally {
      // caller clears upload state
    }
  };

  const handleUploadSectionAttachmentFiles = async (sectionId: string, files: File[]) => {
    if (!files.length) return;
    setUploadingAttachmentSectionId(sectionId);
    const baseIndex = getNextOrderIndex(sectionId);
    for (const [index, file] of files.entries()) {
      await handleUploadSectionAttachmentFile(sectionId, file, baseIndex + index);
    }
    await refreshMediaForActiveSection();
    setUploadingAttachmentSectionId((current) => (current === sectionId ? null : current));
  };

  const handleAddSectionLink = (sectionId: string) => {
    const draft = sectionMediaDrafts[sectionId];
    const url = draft?.url?.trim() ?? "";
    if (!url) return;
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url,
        type: "link",
        order_index: getNextOrderIndex(sectionId)
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionMediaDrafts((prev) => ({ ...prev, [sectionId]: { url: "", type: "link" } }));
      }
    });
  };

  const handleAddDrinkLink = (sectionId: string) => {
    const draft = sectionDrinkLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionDrinkLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const handleAddFoodLink = (sectionId: string) => {
    const draft = sectionFoodLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionFoodLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const handleAddVisitLink = (sectionId: string) => {
    const draft = sectionVisitLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionVisitLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const handleAddExperienceLink = (sectionId: string) => {
    const draft = sectionExperienceLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionExperienceLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const handleAddShoppingLink = (sectionId: string) => {
    const draft = sectionShoppingLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionShoppingLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const handleAddBeachLink = (sectionId: string) => {
    const draft = sectionBeachLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionBeachLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const handleAddServiceLink = (sectionId: string) => {
    const draft = sectionServiceLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionServiceLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const handleToggleVisibility = (sectionId: string) => {
    const current = sectionsState.find((s) => s.id === sectionId);
    if (!current) return;
    const currentVisible = isVisible(current.visible);
    const nextVisible = !currentVisible;
    setSectionsState((prev) => prev.map((s) => (s.id === sectionId ? { ...s, visible: nextVisible } : s)));
    startTransition(async () => {
      await markDraftIfNeeded();
      const { error } = await supabase.from("sections").update({ visible: nextVisible }).eq("id", sectionId);
      if (error) {
        console.error("Impossibile aggiornare la visibilita della sezione", error);
        setSectionsState((prev) => prev.map((s) => (s.id === sectionId ? { ...s, visible: currentVisible } : s)));
      }
    });
  };

  const handleAddColazioneLink = (sectionId: string) => {
    const draft = sectionColazioneLinkDrafts[sectionId] ?? { url: "", description: "" };
    const url = draft.url.trim();
    if (!url) return;
    const payload = JSON.stringify({ url, description: draft.description });
    startTransition(async () => {
      await markDraftIfNeeded();
      const { data, error } = await insertMediaItem({
        section_id: sectionId,
        url: payload,
        type: "link",
        order_index: getNextOrderIndex(sectionId),
        description: draft.description ?? null
      });
      if (error) {
        showMediaError("Errore nel salvataggio del link. Riprova", error.message);
      }
      if (!error && data) {
        setMediaState((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? mediaByParent[sectionId] ?? []), data as MediaItem]
        }));
        setMediaCommentDrafts((prev) => ({ ...prev, [data.id]: data.description ?? "" }));
        setSectionColazioneLinkDrafts((prev) => ({ ...prev, [sectionId]: { url: "", description: "" } }));
      }
    });
  };

  const reorderSections = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...ordered];
    const fromIndex = list.findIndex((s) => s.id === fromId);
    const toIndex = list.findIndex((s) => s.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const updated = [...list];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    const withOrder = updated.map((section, index) => ({ ...section, order_index: index + 1 }));
    setSectionsState(withOrder);
    startTransition(async () => {
      await markDraftIfNeeded();
      await Promise.all(
        withOrder.map((section) =>
          supabase.from("sections").update({ order_index: section.order_index }).eq("id", section.id)
        )
      );
    });
  };

  const handleSectionDragStart = (event: DragEvent<HTMLElement>, sectionId: string) => {
    if (isReadOnly) return;
    event.dataTransfer.effectAllowed = "move";
    setSectionDragId(sectionId);
  };

  const handleSectionDragOver = (event: DragEvent<HTMLElement>) => {
    if (isReadOnly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleSectionDrop = (event: DragEvent<HTMLElement>, sectionId: string) => {
    if (isReadOnly) return;
    event.preventDefault();
    if (!sectionDragId) return;
    reorderSections(sectionDragId, sectionId);
    setSectionDragId(null);
  };

  const handleSectionDragEnd = () => {
    setSectionDragId(null);
  };

  const reorderSubsections = (sectionId: string, fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...activeSubs];
    const fromIndex = list.findIndex((sub) => sub.id === fromId);
    const toIndex = list.findIndex((sub) => sub.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const updated = [...list];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    const orderMap = new Map(updated.map((sub, index) => [sub.id, index + 1]));
    setSubsState((prev) => {
      const next = { ...prev };
      const currentList = next[sectionId] ?? [];
      next[sectionId] = currentList.map((sub) =>
        orderMap.has(sub.id) ? { ...sub, order_index: orderMap.get(sub.id) } : sub
      );
      return next;
    });
    startTransition(async () => {
      await markDraftIfNeeded();
      await Promise.all(
        updated.map((sub, index) =>
          supabase.from("subsections").update({ order_index: index + 1 }).eq("id", sub.id)
        )
      );
    });
  };

  const handleSubDragStart = (event: DragEvent<HTMLElement>, subId: string) => {
    if (isReadOnly) return;
    event.dataTransfer.effectAllowed = "move";
    setSubDragId(subId);
  };

  const handleSubDragOver = (event: DragEvent<HTMLElement>) => {
    if (isReadOnly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleSubDrop = (event: DragEvent<HTMLElement>, subId: string) => {
    if (isReadOnly) return;
    event.preventDefault();
    if (!activeSection || !subDragId) return;
    reorderSubsections(activeSection.id, subDragId, subId);
    setSubDragId(null);
  };

  const handleSubDragEnd = () => {
    setSubDragId(null);
  };

  return (
    <section className={`classico-editor-preview${isModernoLayout ? " moderno-preview" : ""}${isIllustrativo ? " illustrativo-preview" : ""}${isRusticoLikeLayout ? " rustico-preview" : ""}${isMediterraneoLayout ? " mediterraneo-preview" : ""}`}>
      {!isReadOnly ? <div className="pill">Anteprima layout {layoutLabel}</div> : null}
      <div className={`classico-sections__panel${isModernoLayout ? " moderno-sections__panel" : ""}${isIllustrativo ? " illustrativo-sections__panel" : ""}`}>
        <div className={`classico-sections__content${isModernoLayout ? " moderno-sections__content" : ""}${isIllustrativo ? " illustrativo-sections__content" : ""}`}>
            {searchEnabled ? (
              <div className="homebook-search">
                <div className="homebook-search__field">
                <input
                  type="search"
                  className="input homebook-search__input"
                  placeholder="Cerca nel homebook (es. wifi, late check-out)"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  aria-label="Cerca nel homebook"
                />
                {hasSearch ? (
                  <button
                    type="button"
                    className="btn btn-secondary homebook-search__clear"
                    onClick={() => setSearchTerm("")}
                  >
                    Pulisci
                  </button>
                ) : null}
              </div>
              {hasSearch ? <div className="homebook-search__meta">{searchStatus}</div> : null}
            </div>
          ) : null}
          {filteredSections.length === 0 ? (
            <div className="classico-empty">
              {hasSearch ? "Nessun risultato trovato." : "Nessuna sezione ancora disponibile."}
            </div>
          ) : (
            <div className={`classico-sections__grid${isModernoLayout ? " moderno-sections__grid" : ""}${isIllustrativo ? " illustrativo-sections__grid" : ""}`}>
              {filteredSections.map((section, index) => {
                const sectionIcon = normalizeTitle(section.title);
                const needsInlineTitleAndToggle =
                  isClassicLayout && (sectionIcon === "come raggiungerci" || sectionIcon === "funzionamento");
                const needsOverlayToggle = isPastelloLayout && sectionIcon === "come raggiungerci";
                const shouldGlow =
                  sectionIcon &&
                  ["check-in", "funzionamento", "regole struttura", "cosa visitare", "esperienze", "servizi", "numeri utili"].includes(sectionIcon);
                const extraClass =
                  sectionIcon === "check-in"
                    ? " classico-card--checkin"
                    : sectionIcon === "come raggiungerci"
                    ? " classico-card--reach"
                    : shouldGlow
                    ? " classico-card--halo"
                    : "";
                let extraMods = "";
                if (sectionIcon === "funzionamento") extraMods = " classico-card--funz";
                const shadowIcons = new Set<IconKey | string>([
                  "funzionamento",
                  "dove mangiare",
                  "dove bere",
                  "esperienze",
                  "shopping",
                  "servizi",
                  "numeri utili"
                ]);
                if (shadowIcons.has(sectionIcon ?? "")) extraMods += " classico-card--shadow";
                const warmBgIcons = new Set<IconKey | string>([
                  "come raggiungerci",
                  "regole struttura",
                  "cosa visitare",
                  "spiagge",
                  "check-out"
                ]);
                if (warmBgIcons.has(sectionIcon ?? "")) extraMods += " classico-card--warm";
                const sandBgIcons = new Set<IconKey | string>([
                  "check-in",
                  "la nostra struttura",
                  "funzionamento",
                  "dove mangiare",
                  "dove bere",
                  "esperienze",
                  "shopping",
                  "servizi",
                  "numeri utili"
                ]);
                if (sandBgIcons.has(sectionIcon ?? "")) extraMods += " classico-card--sand";
                if (sectionIcon === "la nostra struttura") extraMods += " classico-card--struttura";
                const isSectionVisible = isVisible(section.visible);
                const isCenterCard = (index + 1) % 3 === 0;
                const sectionSlug = slugify(section.title, `sezione-${section.order_index}`);
                const baseIcon = sectionIcon ? renderIconForKey(sectionIcon) : null;
                const iconNode = sectionIcon && baseIcon
                  ? isRomanticoLayout
                    ? (
                      <RomanticoIcon
                        slug={sectionSlug}
                        fallback={baseIcon}
                        isModerno={isModernoLike}
                      />
                    )
                    : isFuturisticoLayout
                    ? (
                      <FuturisticoIcon
                        slug={sectionSlug}
                        fallback={baseIcon}
                        isModerno={isModernoLike}
                      />
                    )
                    : isNotturnoLayout
                    ? (
                      <NotturnoIcon
                        slug={sectionSlug}
                        fallback={baseIcon}
                        isModerno={isModernoLike}
                      />
                    )
                    : baseIcon
                  : baseIcon;
                const cardStyle: React.CSSProperties = {
                  opacity: isSectionVisible ? 1 : 0.6,
                  cursor: isReadOnly ? "pointer" : "grab"
                };
                if (isRusticoLikeLayout) {
                  cardStyle.background = "#ffffff";
                  cardStyle.backgroundColor = "#ffffff";
                }
                return (
                  <div
                  key={section.id}
                  role="button"
                  tabIndex={0}
                  className={`classico-card${extraClass}${extraMods}${isCenterCard ? " classico-card--center" : ""}${isModernoLayout ? " moderno-card" : ""}${isIllustrativo ? " illustrativo-card" : ""} classico-card--slug-${sectionSlug}`}
                  onClick={() => setActiveSectionId(section.id)}
                  draggable={!isReadOnly}
                  onDragStart={(event) => handleSectionDragStart(event, section.id)}
                  onDragOver={handleSectionDragOver}
                  onDrop={(event) => handleSectionDrop(event, section.id)}
                  onDragEnd={handleSectionDragEnd}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveSectionId(section.id);
                    }
                  }}
                  style={cardStyle}
                >
                  <span className="classico-card__icon" aria-hidden="true">
                    {iconNode ?? (
                    <span className="classico-card__icon-fallback">{section.order_index}</span>
                  )}
                </span>
                {needsInlineTitleAndToggle ? (
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        className="classico-card__title"
                        style={
                          sectionIcon === "come raggiungerci"
                            ? { flex: 1, minWidth: 0, whiteSpace: "normal", overflow: "visible", textOverflow: "unset" }
                            : { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                        }
                      >
                        {section.title}
                      </span>
                      {!isReadOnly ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: "4px 8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "12px",
                            lineHeight: 1.1,
                            minWidth: 0
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(section.id);
                          }}
                          disabled={isPending || isReadOnly}
                          aria-label={isSectionVisible ? `Nascondi ${section.title}` : `Mostra ${section.title}`}
                          title={isSectionVisible ? `Nascondi ${section.title}` : `Mostra ${section.title}`}
                        >
                          {isSectionVisible ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      ) : null}
                    </div>
                    {!isReadOnly && !isSectionVisible ? (
                      <span className="classico-editor-modal__muted" style={{ marginTop: 4 }}>
                        Nascosta agli ospiti
                      </span>
                    ) : null}
                  </div>
                ) : needsOverlayToggle ? (
                  <>
                    <span className="classico-card__title">{section.title}</span>
                    {!isReadOnly ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            padding: "4px 8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "12px",
                            lineHeight: 1.1
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(section.id);
                          }}
                          disabled={isPending || isReadOnly}
                          aria-label={isSectionVisible ? `Nascondi ${section.title}` : `Mostra ${section.title}`}
                          title={isSectionVisible ? `Nascondi ${section.title}` : `Mostra ${section.title}`}
                        >
                          {isSectionVisible ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                        {!isSectionVisible ? (
                          <span
                            className="classico-editor-modal__muted"
                            style={{ position: "absolute", left: 10, bottom: 10, fontSize: 12 }}
                          >
                            Nascosta
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="classico-card__title">{section.title}</span>
                    {!isReadOnly ? (
                      <div
                        className={sectionIcon === "funzionamento" ? "classico-card__toggle" : undefined}
                        style={{
                          marginTop: 6,
                          display: "grid",
                          gap: 4,
                          alignItems: "start",
                          justifyItems: "start"
                        }}
                      >
                        {!isSectionVisible ? (
                          <span className="classico-editor-modal__muted">Nascosta agli ospiti</span>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: "6px 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(section.id);
                          }}
                          disabled={isPending || isReadOnly}
                          aria-label={isSectionVisible ? `Nascondi ${section.title}` : `Mostra ${section.title}`}
                          title={isSectionVisible ? `Nascondi ${section.title}` : `Mostra ${section.title}`}
                        >
                          {isSectionVisible ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {activeSection ? (
        <div className="classico-editor-modal" role="dialog" aria-modal="true">
          <div className="classico-editor-modal__backdrop" onClick={() => setActiveSectionId(null)} />
          <div
            className={`classico-editor-modal__card${
              activeSectionSlug ? ` classico-editor-modal__card--${activeSectionSlug}` : ""
            }${isOroLayout ? " classico-editor-modal__card--oro" : ""}${isReadOnly ? " classico-editor-modal__card--readonly" : ""}`}
          >
            <header className="classico-editor-modal__header">
              {!isReadOnly ? (
                <button
                  type="button"
                  className="classico-editor-modal__save"
                  onClick={handleSaveAll}
                  disabled={isPending || isReadOnly || !hasUnsavedChanges}
                  aria-disabled={isPending || isReadOnly || !hasUnsavedChanges}
                >
                  {isPending ? "Salvo..." : hasUnsavedChanges ? "Salva" : "Salvato"}
                </button>
              ) : null}
              {!isReadOnly && homebookId ? (
                <button
                  type="button"
                  className="classico-editor-modal__save classico-editor-modal__reload"
                  onClick={refreshMediaForActiveSection}
                  disabled={isMediaRefreshing}
                  aria-disabled={isMediaRefreshing}
                >
                  {isMediaRefreshing ? "Ricarico..." : "Ricarica media"}
                </button>
              ) : null}
              {!isReadOnly && hasUnsavedChanges ? (
                <span className="classico-editor-modal__unsaved">Modifiche non salvate</span>
              ) : null}
              {!isReadOnly && showSavedFeedback ? (
                <span className="classico-editor-modal__saved">Salvato ✓</span>
              ) : null}
              {!isReadOnly && mediaErrorMessage ? (
                <span className="classico-editor-modal__error">{mediaErrorMessage}</span>
              ) : null}
              <div className="classico-editor-modal__title-block">
                <span className="classico-editor-modal__icon" aria-hidden="true">
                  {modalIconNode ?? (
                    <span className="classico-card__icon-fallback">{activeSection.order_index}</span>
                  )}
                </span>
                <h3 className={`classico-editor-modal__title classico-title-playfair${titleSlugClass}`}>
                  {activeSection.title}
                </h3>
              </div>
              <button
                type="button"
                className="classico-editor-modal__close"
                aria-label="Chiudi"
                onClick={() => setActiveSectionId(null)}
              >
                x
              </button>
            </header>

            <fieldset disabled={isReadOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <div className="classico-editor-modal__body">
              {iconKey === "dove mangiare" ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {foodLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {foodLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) =>
                              handleDrop(event, activeSection.id, "link", item.id, foodLinkIds)
                            }
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">
                        Aggiungi link illimitati con descrizione (es. ristoranti, menu, prenotazioni).
                      </p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionFoodLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionFoodLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionFoodLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionFoodLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {iconKey === "cosa visitare" ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {visitLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {visitLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) =>
                              handleDrop(event, activeSection.id, "link", item.id, visitLinkIds)
                            }
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">
                        Aggiungi link illimitati con descrizione (es. attrazioni, mappe, prenotazioni).
                      </p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionVisitLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionVisitLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionVisitLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionVisitLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {iconKey === "esperienze" ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {experienceLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {experienceLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) =>
                              handleDrop(event, activeSection.id, "link", item.id, experienceLinkIds)
                            }
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">Aggiungi link illimitati con descrizione (es. tour, esperienze, ticket).</p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionExperienceLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionExperienceLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionExperienceLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionExperienceLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {iconKey === "shopping" ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {shoppingLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {shoppingLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) =>
                              handleDrop(event, activeSection.id, "link", item.id, shoppingLinkIds)
                            }
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">Aggiungi link illimitati con descrizione (es. negozi, mercati, e-commerce).</p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionShoppingLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionShoppingLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionShoppingLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionShoppingLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {iconKey === "servizi" ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {serviceLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {serviceLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) =>
                              handleDrop(event, activeSection.id, "link", item.id, serviceLinkIds)
                            }
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">Aggiungi link illimitati con descrizione (es. assistenza, contatti, fornitori).</p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionServiceLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionServiceLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionServiceLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionServiceLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {iconKey === "spiagge" ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {beachLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {beachLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) =>
                              handleDrop(event, activeSection.id, "link", item.id, beachLinkIds)
                            }
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">Aggiungi link illimitati con descrizione (es. stabilimenti, mappe, info mare).</p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionBeachLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionBeachLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionBeachLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionBeachLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {iconKey === "dove bere" ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {drinkLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {drinkLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) =>
                              handleDrop(event, activeSection.id, "link", item.id, drinkLinkIds)
                            }
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">Aggiungi link illimitati con descrizione (es. bar, locali, menu).</p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionDrinkLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionDrinkLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionDrinkLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionDrinkLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {activeSection && showSectionAttachments ? (
                <div className="classico-editor-modal__group" style={{ marginTop: 12 }}>
                  <div className="classico-editor-modal__group-title">Allegati</div>
                  {sectionAttachments.length ? (
                    <div className="classico-editor-modal__chips">
                      {sectionAttachments.map((item) => (
                        <span key={item.id} style={{ display: "grid", gap: 6 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <a
                              className="classico-editor-modal__chip"
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Allegato - {getAttachmentLabel(item)}
                            </a>
                            {!isReadOnly ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: "2px 6px", lineHeight: 1 }}
                                onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                disabled={isPending || isReadOnly}
                                aria-label={`Elimina ${getAttachmentLabel(item)}`}
                                title="Elimina"
                              >
                                x
                              </button>
                            ) : null}
                          </span>
                          {isReadOnly ? (
                            item.description ? (
                              <span className="classico-editor-modal__link-desc">{item.description}</span>
                            ) : null
                          ) : (
                            <input
                              className="input classico-editor-modal__comment-input"
                              placeholder="Nome/descrizione (opzionale)"
                              value={mediaCommentDrafts[item.id] ?? item.description ?? ""}
                              onChange={(e) =>
                                setMediaCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              disabled={!isActiveSectionVisible}
                            />
                          )}
                        </span>
                      ))}
                    </div>
                  ) : !isReadOnly ? (
                    <p className="classico-editor-modal__muted">Aggiungi allegati (PDF, menu, istruzioni).</p>
                  ) : null}
                  {!isReadOnly ? (
                    <div className="classico-editor-modal__controls" style={{ marginTop: 6 }}>
                      <label
                        className="btn btn-secondary"
                        style={{
                          cursor: isActiveSectionVisible ? "pointer" : "not-allowed",
                          opacity: isActiveSectionVisible ? 1 : 0.55
                        }}
                      >
                        <input
                          type="file"
                          accept={ATTACHMENT_FILE_ACCEPT}
                          multiple
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            if (!files.length) return;
                            handleUploadSectionAttachmentFiles(activeSection.id, files);
                            e.currentTarget.value = "";
                          }}
                          disabled={!isActiveSectionVisible || uploadingAttachmentSectionId === activeSection.id}
                        />
                        {uploadingAttachmentSectionId === activeSection.id ? "Caricamento..." : "Carica allegato"}
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showStandardSubsections ? (
                activeSubs.length === 0 ? (
                  !isReadOnly ? <div className="classico-editor-modal__empty">Nessuna sottosezione ancora aggiunta.</div> : null
                ) : (
                  <div className="classico-editor-modal__list">
                  {activeSubs.map((sub, idx) => {
                    const mediaForSub = mediaState[sub.id] ?? mediaByParent[sub.id] ?? [];
                    const mediaVisualItems = mediaForSub.filter((m) => m.type === "image" || m.type === "video");
                    const mediaImages = mediaVisualItems.filter((m) => m.type === "image");
                    const mediaVideos = mediaVisualItems.filter((m) => m.type === "video");
                    const mediaFiles = mediaForSub.filter((m) => m.type === "file");
                    const mediaLinks = mediaForSub.filter((m) => m.type === "link");
                    const mediaVisualIds = mediaVisualItems.map((item) => item.id);
                    const mediaLinkIds = mediaLinks.map((item) => item.id);
                    const uploadDraftEntries = uploadDrafts[sub.id] ?? [];
                    const uploadDraftImages = uploadDraftEntries.filter((draft) => !draft.file.type.startsWith("video"));
                    const uploadDraftVideos = uploadDraftEntries.filter((draft) => draft.file.type.startsWith("video"));
                    const parsed = parseSubContent(sub.content_text);
                    const subTitle = parsed.title.trim() || `Nota ${idx + 1}`;
                    const normalized = subTitle
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "");
                    const normalizedKey = normalized.replace(/\s+/g, "");
                    const normalizedNoHyphen = normalized.replace(/-/g, " ");
                    const displayTitle =
                      normalizedKey === "formalita" || normalizedKey === "formalit"
                        ? "Formalita"
                        : normalizedKey === "accessibilita" || normalizedKey === "accessibilit"
                        ? "Accessibilita"
                        : subTitle;
                    const sectionNormalized = activeSection.title
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "");
                    const isTrainSubsection =
                      normalized.includes("treno") || normalized.includes("treni");
                    const isRomanticoSubsection = isRomanticoLayout;

                    let iconSrc = "/Icons/Classico/valigia.png";
                    if (isRusticoLikeLayout) {
                      const rusticoIcon = resolveRusticoSubsectionIcon({
                        sectionNormalized,
                        normalized,
                        normalizedKey,
                        normalizedNoHyphen,
                        isTrainSubsection,
                        iconFolder: rusticoIconFolder
                      });
                      if (rusticoIcon) iconSrc = rusticoIcon;
                    }
                    if (isRomanticoLayout && sectionNormalized.includes("check-in") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Romantico/valigia.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("check-in") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Oro/valigia.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-in") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Futuristico/calendario.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("check-in") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Notturno/valigia.png";
                    } else if (
                      isRusticoLikeLayout &&
                      sectionNormalized.includes("check-in") &&
                      (normalizedKey === "formalita" || normalizedKey === "formalit")
                    ) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "documenti1.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("check-in") && normalizedKey === "formalita") {
                      iconSrc = "/Icons/Romantico/documenti1.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("check-in") && normalized.includes("formalita")) {
                      iconSrc = "/Icons/Oro/passaporto.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-in") && normalizedKey === "formalita") {
                      iconSrc = "/Icons/Futuristico/documenti.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("check-in") && normalized.includes("formalita")) {
                      iconSrc = "/Icons/Notturno/passaporto.png";
                    } else if (
                      isRusticoLikeLayout &&
                      sectionNormalized.includes("check-in") &&
                      (normalizedNoHyphen.includes("self check in") || normalized.includes("self check-in"))
                    ) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "self-check-in.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("check-in") && normalizedNoHyphen.includes("self check in")) {
                      iconSrc = "/Icons/Romantico/self-check-in.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("check-in") && normalized.includes("self check-in")) {
                      iconSrc = "/Icons/Oro/self-check-in.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-in") && normalizedNoHyphen.includes("self check in")) {
                      iconSrc = "/Icons/Futuristico/self-check-in.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("check-in") && normalizedNoHyphen.includes("self check in")) {
                      iconSrc = "/Icons/Notturno/self-check-in.png";
                    } else if (
                      isRusticoLikeLayout &&
                      sectionNormalized.includes("check-in") &&
                      (normalized.includes("check-in in presenza") || normalizedNoHyphen.includes("check in in presenza"))
                    ) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "check-in-di-persona.png");
                    } else if (
                      isRomanticoLayout &&
                      sectionNormalized.includes("check-in") &&
                      (normalized.includes("check-in in presenza") || normalizedNoHyphen.includes("check in in presenza"))
                    ) {
                      iconSrc = "/Icons/Romantico/check-in-di-persona.png?v=2";
                    } else if (
                      isFuturisticoLayout &&
                      sectionNormalized.includes("check-in") &&
                      (normalized.includes("check-in in presenza") || normalizedNoHyphen.includes("check in in presenza"))
                    ) {
                      iconSrc = "/Icons/Futuristico/check-in3.png";
                    } else if (
                      isNotturnoLayout &&
                      sectionNormalized.includes("check-in") &&
                      (normalized.includes("check-in in presenza") || normalizedNoHyphen.includes("check in in presenza"))
                    ) {
                      iconSrc = "/Icons/Notturno/check-in-in-presenza.png";
                    } else if (
                      isOroLayout &&
                      (normalized.includes("check-in in presenza") || normalizedNoHyphen.includes("check in in presenza")) &&
                      (sectionNormalized.includes("accoglienza") || sectionNormalized.includes("check-in"))
                    ) {
                      iconSrc = "/Icons/Oro/accoglienza.png";
                    } else if (isPastello && sectionNormalized.includes("check-in") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Pastello/calendario.png";
                    } else if (isPastello && normalized.includes("check-in in presenza")) {
                      iconSrc = "/Icons/Pastello/accoglienza.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-in in presenza") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Illustrativo/scambio-chiavi.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-in") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Illustrativo/calendario-1.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "orario.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Romantico/orario1.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Oro/orario.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Futuristico/orologio.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Notturno/orario.png";
                    } else if (isPastello && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Pastello/orario-1.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Illustrativo/calendario.png";
                    } else if (isModernoLike && sectionNormalized.includes("check-in") && normalized.includes("prima di partire")) {
                      iconSrc = "/Icons/Moderno/calendario.png?v=1";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "check-in-di-persona.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Romantico/check-in1.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Pastello/check-in.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Illustrativo/calendario-1.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Moderno/chiavi-1.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Oro/check-in-1.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Futuristico/check-in.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Notturno/valigie.png";
                    } else if (sectionNormalized.includes("regole struttura") && normalized === "check-in") {
                      iconSrc = "/Icons/Classico/chiavi.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "check-out.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Romantico/check-out1.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Pastello/check-out.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Illustrativo/check-out.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Moderno/check-out.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Oro/check-out.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Futuristico/check-out.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Notturno/check-out.png";
                    } else if (sectionNormalized.includes("regole struttura") && normalized === "check-out") {
                      iconSrc = "/Icons/Classico/check-out.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "musica.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Romantico/musica.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Pastello/silenzio.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Illustrativo/musica.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Moderno/silenzio.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Oro/silenzio.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Futuristico/musica.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Notturno/silenzio.png";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("silenzio e buon vicinato")) {
                      iconSrc = "/Icons/Classico/silenzio.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "sigaretta.png");
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Oro/fumo.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Futuristico/sigaretta.png";
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Romantico/sigaretta.png?v=2";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Notturno/sigaretta.png";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Pastello/sigaretta.png?v=2";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Illustrativo/fumo.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Moderno/sigaretta.png?v=1";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("vietato fumare")) {
                      iconSrc = "/Icons/Classico/sigaretta.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "ospiti.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = "/Icons/Romantico/ospiti.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = "/Icons/Pastello/valigia.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = "/Icons/Illustrativo/ospiti.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = "/Icons/Moderno/ospiti.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = "/Icons/Oro/ospiti.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = "/Icons/Futuristico/altri-ospiti.png";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("accesso altri ospiti")) {
                      iconSrc = "/Icons/Classico/ospiti.png";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Oro/animali.png?v=1";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "documenti.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Romantico/documenti.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Futuristico/passaporto.png";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Pastello/documenti-1.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Illustrativo/documenti.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Moderno/documenti.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Oro/passaporto.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Notturno/documenti.png";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("documenti")) {
                      iconSrc = "/Icons/Classico/documenti.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && (normalized.includes("chiavi della casa") || normalized === "chiavi")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "chiavi.png");
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && (normalized.includes("chiavi della casa") || normalized === "chiavi")) {
                      iconSrc = "/Icons/Pastello/chiavi.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && (normalized.includes("chiavi della casa") || normalized === "chiavi")) {
                      iconSrc = "/Icons/Illustrativo/chiavi.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && (normalized.includes("chiavi della casa") || normalized === "chiavi")) {
                      iconSrc = "/Icons/Moderno/chiavi-1.png?v=1";
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("chiavi della casa")) {
                      iconSrc = "/Icons/Romantico/chiavi.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("chiavi della casa")) {
                      iconSrc = "/Icons/Futuristico/chiavi1.png";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && (normalized.includes("chiavi della casa") || normalized === "chiavi")) {
                      iconSrc = "/Icons/Oro/chiavi.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && (normalized.includes("chiavi della casa") || normalized === "chiavi")) {
                      iconSrc = "/Icons/Notturno/chiavi.png";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("chiavi della casa")) {
                      iconSrc = "/Icons/Classico/chiavi-1.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "inventario.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Romantico/lista.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Pastello/inventario.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Illustrativo/lista-1.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Moderno/lista.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Oro/inventario.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Futuristico/lista.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Notturno/lista2.png";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Classico/inventario.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "pulizia.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Romantico/pulizia.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Oro/pulizie.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Futuristico/pulizia.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Notturno/pulizia.png";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Pastello/pulizie.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Illustrativo/pulizie.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Moderno/pulizie.png?v=1";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Classico/pulizia.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "animali.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Romantico/animali.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Futuristico/animali.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Notturno/animali.png";
                    } else if (isPastello && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Pastello/animali.png";
                    } else if (isIllustrativo && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Illustrativo/animali.png";
                    } else if (isModernoLike && sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Moderno/animali.png?v=1";
                    } else if (sectionNormalized.includes("regole struttura") && normalized.includes("animali")) {
                      iconSrc = "/Icons/Classico/animali.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "chiavi1.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = "/Icons/Romantico/chiavi.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = "/Icons/Oro/chiavi-1.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = "/Icons/Futuristico/chiavi3.png";
                    } else if (isPastello && sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = "/Icons/Pastello/chiavi-1.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = "/Icons/Illustrativo/chiavi-1.png";
                    } else if (isModernoLike && sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = "/Icons/Moderno/chiavi-1.png?v=1";
                    } else if (sectionNormalized.includes("check-out") && normalized.includes("chiavi")) {
                      iconSrc = "/Icons/Classico/chiavi.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "pulizia1.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Romantico/pulizia1.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Oro/pulizie.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Futuristico/pulizia.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Notturno/pulizia.png";
                    } else if (isPastello && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Pastello/pulizie-1.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Illustrativo/pulizie.png";
                    } else if (isModernoLike && sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Moderno/pulizie.png?v=1";
                    } else if (sectionNormalized.includes("check-out") && normalized.includes("pulizie")) {
                      iconSrc = "/Icons/Classico/pulizia.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "lista.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Romantico/lista2.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Oro/inventario-1.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Futuristico/inventario.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Notturno/lista2.png";
                    } else if (isPastello && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Pastello/lista.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Illustrativo/inventario.png";
                    } else if (isModernoLike && sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Moderno/lista-1.png?v=1";
                    } else if (sectionNormalized.includes("check-out") && normalized.includes("inventario")) {
                      iconSrc = "/Icons/Classico/lista.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "check-out1.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Romantico/orario.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Pastello/orario.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Illustrativo/check-out-1.png";
                    } else if (isModernoLike && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Moderno/clessidra.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Oro/check-out-1.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Futuristico/check-out2.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Notturno/orario1.png";
                    } else if (sectionNormalized.includes("check-out") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Classico/check-out-1png.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "accoglienza.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = "/Icons/Romantico/accoglienza.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = "/Icons/Oro/accoglienza.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = "/Icons/Futuristico/accoglienza.png";
                    } else if (isPastello && sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = "/Icons/Pastello/accoglienza.png";
                    } else if (isIllustrativo && sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = "/Icons/Illustrativo/scambio-chiavi.png";
                    } else if (isModernoLike && sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = "/Icons/Moderno/accoglienza.png?v=1";
                    } else if (sectionNormalized.includes("numeri utili") && normalized.includes("accoglienza")) {
                      iconSrc = "/Icons/Classico/accoglienza.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "taxi.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Romantico/taxi.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Oro/taxi.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Futuristico/taxi.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Notturno/taxi.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "estintore.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Romantico/estintore.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Oro/estintore.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Futuristico/pompieri.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Notturno/idrante.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "polizia.png");
                    } else if (isOroLayout && sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = "/Icons/Oro/polizia.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = "/Icons/Notturno/polizia.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "ospedale.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Romantico/guardia-medica.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Pastello/guardia-medica.png";
                    } else if (isIllustrativo && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Illustrativo/cassettamedica.png";
                    } else if (isOroLayout && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Oro/guardia-medica.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Futuristico/ospedale.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Notturno/guardia-medica.png";
                    } else if (isModernoLike && sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Moderno/guardia-medica.png?v=1";
                    } else if (sectionNormalized.includes("numeri utili") && normalized.includes("guardia medica")) {
                      iconSrc = "/Icons/Classico/guardia-medica.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "farmacia.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Romantico/farmacia.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Oro/farmacia.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Futuristico/farmacia.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Notturno/farmacia.png";
                    } else if (isPastello && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Pastello/farmacia.png";
                    } else if (isIllustrativo && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Illustrativo/farmacia.png";
                    } else if (isModernoLike && sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Moderno/farmacia.png?v=1";
                    } else if (sectionNormalized.includes("numeri utili") && normalized.includes("farmacia")) {
                      iconSrc = "/Icons/Classico/farmacia.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "guardia-medica.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Romantico/ambulanza.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Oro/ospedale.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Futuristico/ambulanza.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Notturno/ambulanza.png";
                    } else if (isPastello && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Pastello/ambulanza.png?v=2";
                    } else if (isIllustrativo && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Illustrativo/ambulanza.png";
                    } else if (isModernoLike && sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Moderno/ospedale.png?v=1";
                    } else if (sectionNormalized.includes("numeri utili") && normalized.includes("ambulanza")) {
                      iconSrc = "/Icons/Classico/ospedale.png";
                    } else if (isRomanticoLayout && sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = "/Icons/Romantico/polizia.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = "/Icons/Pastello/polizia.png";
                    } else if (isIllustrativo && sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = "/Icons/Illustrativo/polizia.png";
                    } else if (isModernoLike && sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = "/Icons/Moderno/polizia.png?v=1";
                    } else if (sectionNormalized.includes("numeri utili") && normalized.includes("polizia")) {
                      iconSrc = "/Icons/Classico/polizia.png";
                    } else if (isPastello && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Pastello/estintore.png";
                    } else if (isIllustrativo && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Illustrativo/estintore.png";
                    } else if (isModernoLike && sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Moderno/estintore.png?v=1";
                    } else if (sectionNormalized.includes("numeri utili") && normalized.includes("vigili del fuoco")) {
                      iconSrc = "/Icons/Classico/estintore.png";
                    } else if (isPastello && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Pastello/taxi.png";
                    } else if (isIllustrativo && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Illustrativo/taxi.png";
                    } else if (isModernoLike && sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Moderno/taxi.png?v=1";
                    } else if (sectionNormalized.includes("numeri utili") && normalized.includes("taxi")) {
                      iconSrc = "/Icons/Classico/taxi.png";
                    } else if (isIllustrativo && sectionNormalized.includes("chiavi") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Illustrativo/chiavi-1.png";
                    } else if (isModernoLike && sectionNormalized.includes("check-in") && normalized.includes("orario")) {
                      iconSrc = "/Icons/Moderno/clessidra.png?v=1";
                    } else if (normalized.includes("orario")) {
                      iconSrc = "/Icons/Classico/clessidra.png";
                    } else if (isPastello && sectionNormalized.includes("check-in") && normalized.includes("formalita")) {
                      iconSrc = "/Icons/Pastello/documenti.png";
                    } else if (isIllustrativo && sectionNormalized.includes("check-in") && normalized.includes("formalita")) {
                      iconSrc = "/Icons/Illustrativo/documenti.png";
                    } else if (isModernoLike && sectionNormalized.includes("check-in") && normalized.includes("formalita")) {
                      iconSrc = "/Icons/Moderno/documenti.png?v=1";
                    } else if (normalized.includes("formalita")) {
                      iconSrc = "/Icons/Classico/documenti.png";
                    } else if (isPastello && normalized.includes("self check-in")) {
                      iconSrc = "/Icons/Pastello/self-check-in.png";
                    } else if (isIllustrativo && normalized.includes("self check-in")) {
                      iconSrc = "/Icons/Illustrativo/selfcheck-in.png";
                    } else if (isModernoLike && normalized.includes("self check-in")) {
                      iconSrc = "/Icons/Moderno/selfcheck-in.png?v=1";
                    } else if (normalized.includes("self check-in")) {
                      iconSrc = "/Icons/Classico/check-in-1.png";
                    } else if (isIllustrativo && normalized.includes("check-in in presenza")) {
                      iconSrc = "/Icons/Illustrativo/scambio-chiavi.png";
                    } else if (isModernoLike && normalized.includes("check-in in presenza")) {
                      iconSrc = "/Icons/Moderno/accoglienza.png?v=1";
                    } else if (normalized.includes("check-in in presenza")) {
                      iconSrc = "/Icons/Classico/accoglienza.png";
                    } else if (
                      isRusticoLikeLayout &&
                      normalized.includes("accesso struttura") &&
                      sectionNormalized.includes("funzionamento")
                    ) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "accesso.png");
                    } else if (
                      isRomanticoLayout &&
                      normalized.includes("accesso struttura") &&
                      (sectionNormalized.includes("funzionamento") || sectionNormalized.includes("la nostra struttura"))
                    ) {
                      iconSrc = "/Icons/Romantico/chiavi2.png?v=2";
                    } else if (
                      isFuturisticoLayout &&
                      normalized.includes("accesso struttura") &&
                      sectionNormalized.includes("funzionamento")
                    ) {
                      iconSrc = "/Icons/Futuristico/chiavi.png";
                    } else if (
                      isNotturnoLayout &&
                      normalized.includes("accesso struttura") &&
                      sectionNormalized.includes("funzionamento")
                    ) {
                      iconSrc = "/Icons/Notturno/accesso.png";
                    } else if (isPastello && sectionNormalized.includes("funzionamento") && normalized.includes("accesso struttura")) {
                      iconSrc = "/Icons/Pastello/accesso.png";
                    } else if (isIllustrativo && sectionNormalized.includes("funzionamento") && normalized.includes("accesso struttura")) {
                      iconSrc = "/Icons/Illustrativo/accesso.png";
                    } else if (isModernoLike && sectionNormalized.includes("funzionamento") && normalized.includes("accesso struttura")) {
                      iconSrc = "/Icons/Moderno/accesso.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("funzionamento") && normalized.includes("accesso struttura")) {
                      iconSrc = "/Icons/Oro/porta.png?v=1";
                    } else if (normalized.includes("accesso struttura")) {
                      iconSrc = "/Icons/Classico/accesso.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "parcheggio.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Romantico/parcheggio.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Oro/parcheggio.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Futuristico/parcheggio.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Notturno/parcheggio.png";
                    } else if (isPastello && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Pastello/parcheggio.png";
                    } else if (isIllustrativo && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Illustrativo/parcheggio.png";
                    } else if (isModernoLike && sectionNormalized.includes("funzionamento") && normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Moderno/parcheggio.png?v=1";
                    } else if (normalized.includes("parcheggio")) {
                      iconSrc = "/Icons/Classico/parcheggio.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "biancheria.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Romantico/biancheria.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Oro/biancheria.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Futuristico/biancheria.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Notturno/biancheria.png";
                    } else if (isPastello && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Pastello/biancheria.png";
                    } else if (isIllustrativo && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Illustrativo/asciugamani.png";
                    } else if (isModernoLike && sectionNormalized.includes("funzionamento") && normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Moderno/biancheria.png?v=1";
                    } else if (normalized.includes("biancheria")) {
                      iconSrc = "/Icons/Classico/asciugamani.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "rifiuti.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Romantico/rifiuti.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Oro/rifiuti.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Futuristico/rifiuti.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Notturno/rifiuti.png";
                    } else if (isPastello && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Pastello/rifiuti.png";
                    } else if (isIllustrativo && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Illustrativo/rifiuti.png";
                    } else if (isModernoLike && sectionNormalized.includes("funzionamento") && normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Moderno/rifiuti.png?v=1";
                    } else if (normalized.includes("rifiuti")) {
                      iconSrc = "/Icons/Classico/rifiuti.png";
                    } else if (
                      isRusticoLikeLayout &&
                      sectionNormalized.includes("funzionamento") &&
                      (normalized.includes("wi-fi") || normalized.includes("wifi"))
                    ) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "wi-fi.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("funzionamento") && (normalized.includes("wi-fi") || normalized.includes("wifi"))) {
                      iconSrc = "/Icons/Romantico/wi-fi.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("funzionamento") && (normalized.includes("wi-fi") || normalized.includes("wifi"))) {
                      iconSrc = "/Icons/Pastello/wifi.png";
                    } else if (isIllustrativo && sectionNormalized.includes("funzionamento") && (normalized.includes("wi-fi") || normalized.includes("wifi"))) {
                      iconSrc = "/Icons/Illustrativo/wifi.png";
                    } else if (isModernoLike && sectionNormalized.includes("funzionamento") && (normalized.includes("wi-fi") || normalized.includes("wifi"))) {
                      iconSrc = "/Icons/Moderno/wifi.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("funzionamento") && (normalized.includes("wi-fi") || normalized.includes("wifi"))) {
                      iconSrc = "/Icons/Oro/wi-fi.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("funzionamento") && (normalized.includes("wi-fi") || normalized.includes("wifi"))) {
                      iconSrc = "/Icons/Futuristico/wi-fi.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("funzionamento") && (normalized.includes("wi-fi") || normalized.includes("wifi"))) {
                      iconSrc = "/Icons/Notturno/wi-fi.png";
                    } else if (normalized.includes("wi-fi") || normalized.includes("wifi")) {
                      iconSrc = "/Icons/Classico/wifi.png";
                    } else if (
                      isRusticoLayout &&
                      sectionNormalized.includes("funzionamento") &&
                      (normalized.includes("climatizzatore") || normalized.includes("condizionatore"))
                    ) {
                      iconSrc = "/Icons/Rustico/condizionatore.png?v=2";
                    } else if (
                      isMediterraneoLayout &&
                      sectionNormalized.includes("funzionamento") &&
                      (normalized.includes("climatizzatore") || normalized.includes("condizionatore"))
                    ) {
                      iconSrc = "/Icons/Mediterraneo/condizionatore.png?v=2";
                    } else if (isRomanticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Romantico/condizionatore.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("funzionamento") && normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Pastello/climatizzatore.png";
                    } else if (isIllustrativo && sectionNormalized.includes("funzionamento") && normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Illustrativo/climatizzatore.png";
                    } else if (isModernoLike && sectionNormalized.includes("funzionamento") && normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Moderno/climatizzatore.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("funzionamento") && normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Oro/condizionatore.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Futuristico/condizionatore.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Notturno/climatizzatore.png";
                    } else if (normalized.includes("climatizzatore")) {
                      iconSrc = "/Icons/Classico/condizionatore.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "riscaldamento.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Romantico/riscaldamento.png?v=2";
                    } else if (isPastello && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Pastello/riscaldamento.png";
                    } else if (isIllustrativo && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Illustrativo/riscaldamento.png";
                    } else if (isModernoLike && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Moderno/riscaldamento.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Oro/riscaldamento.png?v=1";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Futuristico/riscaldamento.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("funzionamento") && normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Notturno/riscaldamento.png";
                    } else if (normalized.includes("riscaldamento")) {
                      iconSrc = "/Icons/Classico/riscaldamento.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "auto.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = "/Icons/Romantico/auto.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = "/Icons/Oro/auto.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = "/Icons/Futuristico/auto.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = "/Icons/Notturno/macchina.png";
                    } else if (isPastello && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = "/Icons/Pastello/macchina.png";
                    } else if (isIllustrativo && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = "/Icons/Illustrativo/macchina.png";
                    } else if (isModernoLike && sectionNormalized.includes("come raggiungerci") && normalized.includes("auto")) {
                      iconSrc = "/Icons/Moderno/macchina.png?v=1";
                    } else if (normalized.includes("auto")) {
                      iconSrc = "/Icons/Classico/auto.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "aereo.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = "/Icons/Romantico/aereo.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = "/Icons/Oro/aereo.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = "/Icons/Futuristico/aereo.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = "/Icons/Notturno/aereo.png";
                    } else if (isPastello && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = "/Icons/Pastello/aereo.png";
                    } else if (isIllustrativo && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = "/Icons/Illustrativo/aereo.png";
                    } else if (isModernoLike && sectionNormalized.includes("come raggiungerci") && normalized.includes("aereo")) {
                      iconSrc = "/Icons/Moderno/aereo.png?v=1";
                    } else if (normalized.includes("aereo")) {
                      iconSrc = "/Icons/Classico/aereo.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "bus.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = "/Icons/Romantico/bus.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = "/Icons/Oro/bus.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = "/Icons/Futuristico/bus.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = "/Icons/Notturno/bus.png";
                    } else if (isPastello && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = "/Icons/Pastello/bus.png";
                    } else if (isIllustrativo && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = "/Icons/Illustrativo/tram.png";
                    } else if (isModernoLike && sectionNormalized.includes("come raggiungerci") && normalized.includes("bus")) {
                      iconSrc = "/Icons/Moderno/bus.png?v=1";
                    } else if (normalized.includes("bus")) {
                      iconSrc = "/Icons/Classico/bus.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "metro.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = "/Icons/Romantico/metro.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = "/Icons/Futuristico/metro.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = "/Icons/Notturno/metro.png";
                    } else if (isPastello && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = "/Icons/Pastello/metro.png";
                    } else if (isIllustrativo && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = "/Icons/Illustrativo/metro.png";
                    } else if (isModernoLike && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = "/Icons/Moderno/metro.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("metro")) {
                      iconSrc = "/Icons/Oro/metro.png";
                    } else if (normalized.includes("metro")) {
                      iconSrc = "/Icons/Classico/metro.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "noleggio.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Romantico/noleggio.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Oro/noleggio.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Futuristico/noleggio.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Notturno/noleggio.png";
                    } else if (isPastello && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Pastello/noleggio.png";
                    } else if (isIllustrativo && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Illustrativo/motorino.png";
                    } else if (isModernoLike && sectionNormalized.includes("come raggiungerci") && normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Moderno/noleggio.png";
                    } else if (normalized.includes("noleggio")) {
                      iconSrc = "/Icons/Classico/noleggio.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "traghetti.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Romantico/traghetto.png?v=2";
                    } else if (isOroLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Oro/traghetto.png";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Futuristico/traghetto.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Notturno/traghetto.png";
                    } else if (isPastello && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Pastello/traghetti.png";
                    } else if (isIllustrativo && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Illustrativo/traghetto.png";
                    } else if (isModernoLike && sectionNormalized.includes("come raggiungerci") && normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Moderno/traghetto.png?v=1";
                    } else if (normalized.includes("traghetto")) {
                      iconSrc = "/Icons/Classico/traghetto.png";
                    } else if (
                      isRusticoLikeLayout &&
                      sectionNormalized.includes("come raggiungerci") &&
                      (isTrainSubsection || normalized.includes("treno"))
                    ) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "treno.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("come raggiungerci") && isTrainSubsection) {
                      iconSrc = "/Icons/Romantico/treno.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("come raggiungerci") && isTrainSubsection) {
                      iconSrc = "/Icons/Futuristico/treno.png";
                    } else if (isNotturnoLayout && sectionNormalized.includes("come raggiungerci") && isTrainSubsection) {
                      iconSrc = "/Icons/Notturno/treno.png";
                    } else if (isPastello && sectionNormalized.includes("come raggiungerci") && isTrainSubsection) {
                      iconSrc = "/Icons/Pastello/treno.png?v=2";
                    } else if (isIllustrativo && sectionNormalized.includes("come raggiungerci") && isTrainSubsection) {
                      iconSrc = "/Icons/Illustrativo/treno.png";
                    } else if (isModernoLike && sectionNormalized.includes("come raggiungerci") && normalized.includes("treno")) {
                      iconSrc = "/Icons/Moderno/treno.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("come raggiungerci") && normalized.includes("treno")) {
                      iconSrc = "/Icons/Oro/treno.png";
                    } else if (normalized.includes("treno")) {
                      iconSrc = "/Icons/Classico/treno.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "casa.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = "/Icons/Romantico/casa.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = "/Icons/Futuristico/casa.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = "/Icons/Pastello/struttura.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = "/Icons/Illustrativo/casa.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = "/Icons/Moderno/struttura.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = "/Icons/Oro/struttura.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("la casa")) {
                      iconSrc = "/Icons/Notturno/casa.png";
                    } else if (normalized.includes("la casa")) {
                      iconSrc = "/Icons/Classico/struttura.png?v=1";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "cucina.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = "/Icons/Romantico/cucina.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = "/Icons/Futuristico/cucina.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = "/Icons/Pastello/cucina.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = "/Icons/Illustrativo/cucina.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = "/Icons/Moderno/cucina.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = "/Icons/Oro/cucina.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("cucina")) {
                      iconSrc = "/Icons/Notturno/cucina.png";
                    } else if (normalized.includes("cucina")) {
                      iconSrc = "/Icons/Classico/cucina.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "terrazza.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Romantico/terrazza.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Futuristico/terrazza.png";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Oro/terrazzo.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Notturno/terrazza.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Pastello/terrazza.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Illustrativo/terrazza.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Moderno/terrazza.png?v=1";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "giardino.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = "/Icons/Romantico/giardino.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = "/Icons/Futuristico/giardino.png";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = "/Icons/Oro/giardino.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = "/Icons/Notturno/giardino.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = "/Icons/Pastello/giardino.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = "/Icons/Illustrativo/giardino.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("giardino")) {
                      iconSrc = "/Icons/Moderno/giardino.png?v=1";
                    } else if (normalized.includes("terrazza")) {
                      iconSrc = "/Icons/Classico/terrazza.png";
                    } else if (normalized.includes("giardino")) {
                      iconSrc = "/Icons/Classico/giardino.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "piscina.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = "/Icons/Romantico/piscina.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = "/Icons/Futuristico/piscina.png";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = "/Icons/Oro/piscina.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = "/Icons/Notturno/piscina.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = "/Icons/Pastello/piscina.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = "/Icons/Illustrativo/piscina.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("piscina")) {
                      iconSrc = "/Icons/Moderno/piscina.png?v=1";
                    } else if (normalized.includes("piscina")) {
                      iconSrc = "/Icons/Classico/piscina.png";
                    } else if (
                      isRusticoLikeLayout &&
                      sectionNormalized.includes("la nostra struttura") &&
                      (normalized.includes("camera da letto") || normalized.includes("letto"))
                    ) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "letto.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Romantico/letto.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Futuristico/letto.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Pastello/letto.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Illustrativo/letto.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Moderno/camera.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Oro/letto.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Notturno/letto.png";
                    } else if (normalized.includes("camera da letto")) {
                      iconSrc = "/Icons/Classico/camera-letto.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "soggiorno.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Romantico/soggiorno.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Futuristico/soggiorno.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Pastello/soggiorno.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Illustrativo/soggiorno.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Moderno/soggiorno.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Oro/soggiorno.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Notturno/soggiorno.png";
                    } else if (normalized.includes("soggiorno")) {
                      iconSrc = "/Icons/Classico/salone.png";
                    } else if (isRusticoLikeLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = getRusticoLikeIconPath(rusticoIconFolder, "bagno.png");
                    } else if (isRomanticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = "/Icons/Romantico/bagno.png?v=2";
                    } else if (isFuturisticoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = "/Icons/Futuristico/bagno.png";
                    } else if (isPastello && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = "/Icons/Pastello/bagno.png";
                    } else if (isIllustrativo && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = "/Icons/Illustrativo/bagno.png";
                    } else if (isModernoLike && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = "/Icons/Moderno/bagno.png?v=1";
                    } else if (isOroLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = "/Icons/Oro/bagno.png?v=1";
                    } else if (isNotturnoLayout && sectionNormalized.includes("la nostra struttura") && normalized.includes("bagno")) {
                      iconSrc = "/Icons/Notturno/bagno.png";
                  } else if (normalized.includes("bagno")) {
                      iconSrc = "/Icons/Classico/bagno.png";
                    }
                    const isSubVisible = isVisible(sub.visible);
                    if (isReadOnly && !isSubVisible) {
                      return null;
                    }
                    return (
                      <article
                        key={sub.id}
                        className="classico-editor-modal__sub"
                        onDragOver={handleSubDragOver}
                        onDrop={(event) => handleSubDrop(event, sub.id)}
                        onDragEnd={handleSubDragEnd}
                      >
                        <div className="classico-editor-modal__sub-heading-row" style={{ alignItems: "center", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                            <span className={`classico-editor-modal__icon valigia-icon${isRomanticoSubsection ? " valigia-icon--romantico" : ""}`} aria-hidden="true">
                              <img src={iconSrc} alt="" className="classico-card__icon-img" />
                            </span>
                            <div className="classico-editor-modal__sub-heading" style={{ flex: 1, minWidth: 0 }}>
                              {displayTitle}
                            </div>
                          </div>
                          {!isReadOnly ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: "2px 6px", lineHeight: 1, cursor: "grab" }}
                                draggable={!isReadOnly}
                                onDragStart={(event) => handleSubDragStart(event, sub.id)}
                                aria-label={`Trascina ${displayTitle} per riordinare`}
                                title="Trascina per riordinare"
                              >
                                ||
                              </button>
                              {!isSubVisible ? (
                                <span className="classico-editor-modal__muted" style={{ fontStyle: "italic" }}>
                                  Nascosta agli ospiti
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                                onClick={() => handleToggleSubVisibility(activeSection.id, sub.id)}
                                disabled={isPending || isReadOnly}
                                aria-label={isSubVisible ? `Nascondi ${displayTitle}` : `Mostra ${displayTitle}`}
                                title={isSubVisible ? `Nascondi ${displayTitle}` : `Mostra ${displayTitle}`}
                              >
                                {isSubVisible ? <EyeOffIcon /> : <EyeIcon />}
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div className="classico-editor-modal__group" style={{ opacity: isSubVisible ? 1 : 0.55 }}>
                          {isReadOnly ? (
                            parsed.body ? <p className="classico-editor-modal__sub-text">{parsed.body}</p> : null
                          ) : (
                            <textarea
                              className="input classico-editor-modal__textarea"
                              value={textDrafts[sub.id] ?? ""}
                              onChange={(e) => setTextDrafts((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                              placeholder="Aggiungi blocchi di testo illimitati..."
                              rows={3}
                              disabled={!isSubVisible}
                            />
                          )}
                        </div>

                        <div className="classico-editor-modal__group" style={{ opacity: isSubVisible ? 1 : 0.55 }}>
                          <div className="classico-editor-modal__group-title">Immagini</div>
                          {!isReadOnly && (mediaVisualItems.length > 1 || uploadDraftEntries.length > 1) ? (
                            <div className="classico-editor-modal__muted" style={{ marginBottom: 6, fontStyle: "italic" }}>
                              Trascina per riordinare
                            </div>
                          ) : null}
                          {uploadDraftImages.length || mediaImages.length ? (
                            <div className="classico-editor-modal__chips">
                              {uploadDraftImages.map((draft, index) => (
                                <span
                                  key={`image-${draft.url}-${index}`}
                                  className="classico-editor-modal__chip"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 10, opacity: 0.9 }}
                                >
                                  <img
                                    src={draft.url}
                                    alt=""
                                    style={{
                                      width: 120,
                                      height: 80,
                                      objectFit: "cover",
                                      borderRadius: 10,
                                      border: "1px dashed rgba(19, 84, 90, 0.28)"
                                    }}
                                    loading="lazy"
                                  />
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: "50%",
                                        border: "2px solid rgba(19, 84, 90, 0.2)",
                                        borderTopColor: "#1f3f45",
                                        animation: "classico-spin 0.9s linear infinite"
                                      }}
                                    />
                                    <span className="classico-editor-modal__muted" style={{ fontWeight: 600 }}>
                                      In caricamento
                                    </span>
                                  </span>
                                </span>
                              ))}
                              {mediaImages.map((item) => (
                                <span
                                  key={item.id}
                                  className="classico-editor-modal__chip"
                                  style={{ display: "grid", gap: 6, cursor: isReadOnly ? "default" : "grab" }}
                                  draggable={!isReadOnly}
                                  onDragStart={(event) => handleDragStart(event, sub.id, "media", item.id)}
                                  onDragOver={handleDragOver}
                                  onDrop={(event) => handleDrop(event, sub.id, "media", item.id, mediaVisualIds)}
                                  onDragEnd={() => setDragInfo(null)}
                                >
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <img
                                      src={item.url}
                                      alt=""
                                      onClick={() => openPreview(item.url, mediaVisualItems)}
                                      style={{
                                        width: 120,
                                        height: 80,
                                        objectFit: "cover",
                                        borderRadius: 10,
                                        border: "1px solid rgba(19, 84, 90, 0.16)",
                                        cursor: "pointer"
                                      }}
                                      loading="lazy"
                                    />
                                    {!isReadOnly ? (
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: "2px 6px", lineHeight: 1 }}
                                        onClick={() => handleDeleteMedia(item.id, sub.id)}
                                        disabled={isPending || isReadOnly}
                                        aria-label={`Elimina ${item.url}`}
                                        title="Elimina"
                                      >
                                        x
                                      </button>
                                    ) : null}
                                  </span>
                                  {isReadOnly ? (
                                    item.description ? (
                                      <span className="classico-editor-modal__link-desc">{item.description}</span>
                                    ) : null
                                  ) : (
                                    <input
                                      className="input classico-editor-modal__comment-input"
                                      placeholder="Commento (opzionale)"
                                      value={mediaCommentDrafts[item.id] ?? item.description ?? ""}
                                      onChange={(e) =>
                                        setMediaCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                      }
                                      disabled={!isSubVisible}
                                    />
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : !isReadOnly ? (
                            <p className="classico-editor-modal__muted">Aggiungi immagini illimitate.</p>
                          ) : null}

                          <div className="classico-editor-modal__group-title">Video</div>
                          {uploadDraftVideos.length || mediaVideos.length ? (
                            <div className="classico-editor-modal__chips">
                              {uploadDraftVideos.map((draft, index) => (
                                <span
                                  key={`video-${draft.url}-${index}`}
                                  className="classico-editor-modal__chip"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 10, opacity: 0.9 }}
                                >
                                  <video
                                    src={draft.url}
                                    controls
                                    style={{ width: 120, height: 80, borderRadius: 10, border: "1px dashed rgba(19, 84, 90, 0.28)" }}
                                  />
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: "50%",
                                        border: "2px solid rgba(19, 84, 90, 0.2)",
                                        borderTopColor: "#1f3f45",
                                        animation: "classico-spin 0.9s linear infinite"
                                      }}
                                    />
                                    <span className="classico-editor-modal__muted" style={{ fontWeight: 600 }}>
                                      In caricamento
                                    </span>
                                  </span>
                                </span>
                              ))}
                              {mediaVideos.map((item) => (
                                <span
                                  key={item.id}
                                  className="classico-editor-modal__chip"
                                  style={{ display: "grid", gap: 6, cursor: isReadOnly ? "default" : "grab" }}
                                  draggable={!isReadOnly}
                                  onDragStart={(event) => handleDragStart(event, sub.id, "media", item.id)}
                                  onDragOver={handleDragOver}
                                  onDrop={(event) => handleDrop(event, sub.id, "media", item.id, mediaVisualIds)}
                                  onDragEnd={() => setDragInfo(null)}
                                >
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <video
                                      src={item.url}
                                      controls
                                      style={{ width: 120, height: 80, borderRadius: 10, border: "1px solid rgba(19, 84, 90, 0.16)" }}
                                    />
                                    {!isReadOnly ? (
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: "2px 6px", lineHeight: 1 }}
                                        onClick={() => handleDeleteMedia(item.id, sub.id)}
                                        disabled={isPending || isReadOnly}
                                        aria-label={`Elimina ${item.url}`}
                                        title="Elimina"
                                      >
                                        x
                                      </button>
                                    ) : null}
                                  </span>
                                  {isReadOnly ? (
                                    item.description ? (
                                      <span className="classico-editor-modal__link-desc">{item.description}</span>
                                    ) : null
                                  ) : (
                                    <input
                                      className="input classico-editor-modal__comment-input"
                                      placeholder="Commento (opzionale)"
                                      value={mediaCommentDrafts[item.id] ?? item.description ?? ""}
                                      onChange={(e) =>
                                        setMediaCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                      }
                                      disabled={!isSubVisible}
                                    />
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : !isReadOnly ? (
                            <p className="classico-editor-modal__muted">Aggiungi video illimitati.</p>
                          ) : null}

                        {!isReadOnly ? (
                          <div className="classico-editor-modal__controls" style={{ marginTop: 6 }}>
                            <input
                              className="input"
                              placeholder="URL immagine o video"
                              value={mediaDrafts[sub.id]?.url ?? ""}
                              onChange={(e) =>
                                setMediaDrafts((prev) => ({
                                  ...prev,
                                  [sub.id]: { url: e.target.value, type: prev[sub.id]?.type ?? "image" }
                                }))
                              }
                              disabled={!isSubVisible}
                            />
                            <select
                              className="input"
                              style={{ width: 140 }}
                              value={mediaDrafts[sub.id]?.type ?? "image"}
                              onChange={(e) =>
                                setMediaDrafts((prev) => ({
                                  ...prev,
                                  [sub.id]: { url: prev[sub.id]?.url ?? "", type: e.target.value as "image" | "video" }
                                }))
                              }
                              disabled={!isSubVisible}
                            >
                              <option value="image">Immagine</option>
                              <option value="video">Video</option>
                            </select>
                            <label
                              className="btn btn-secondary"
                              style={{ cursor: isSubVisible ? "pointer" : "not-allowed", opacity: isSubVisible ? 1 : 0.55 }}
                            >
                              <input
                                type="file"
                                accept={MEDIA_FILE_ACCEPT}
                                multiple
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  const files = Array.from(e.target.files ?? []);
                                  if (!files.length) return;
                                  handleUploadMediaFiles(sub.id, files);
                                  e.currentTarget.value = "";
                                }}
                                disabled={!isSubVisible || uploadingSubId === sub.id}
                              />
                              {uploadingSubId === sub.id ? "Caricamento..." : "Carica da dispositivo"}
                            </label>
                          </div>
                        ) : null}
                        </div>

                        {!hideColazioneSubExtras ? (
                          <div className="classico-editor-modal__group" style={{ opacity: isSubVisible ? 1 : 0.55 }}>
                            <div className="classico-editor-modal__group-title">Link</div>
                            {!isReadOnly && mediaLinks.length > 1 ? (
                              <div className="classico-editor-modal__muted" style={{ marginBottom: 6, fontStyle: "italic" }}>
                                Trascina per riordinare
                              </div>
                            ) : null}
                            {mediaLinks.length ? (
                              <div className="classico-editor-modal__chips">
                                {mediaLinks.map((item) => (
                                  <span
                                    key={item.id}
                                    style={{ display: "grid", gap: 6, cursor: isReadOnly ? "default" : "grab" }}
                                    draggable={!isReadOnly}
                                    onDragStart={(event) => handleDragStart(event, sub.id, "link", item.id)}
                                    onDragOver={handleDragOver}
                                    onDrop={(event) => handleDrop(event, sub.id, "link", item.id, mediaLinkIds)}
                                    onDragEnd={() => setDragInfo(null)}
                                  >
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                      {renderEditorLinkChip({ url: item.url }, item.id)}
                                      {!isReadOnly ? (
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: "2px 6px", lineHeight: 1 }}
                                          onClick={() => handleDeleteMedia(item.id, sub.id)}
                                          disabled={isPending || isReadOnly}
                                          aria-label={`Elimina ${item.url}`}
                                          title="Elimina"
                                        >
                                          x
                                        </button>
                                      ) : null}
                                    </span>
                                    {isReadOnly ? (
                                      item.description ? (
                                        <span className="classico-editor-modal__link-desc">{item.description}</span>
                                      ) : null
                                    ) : (
                                      <input
                                        className="input classico-editor-modal__comment-input"
                                        placeholder="Commento (opzionale)"
                                        value={mediaCommentDrafts[item.id] ?? item.description ?? ""}
                                        onChange={(e) =>
                                          setMediaCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                        }
                                        disabled={!isSubVisible}
                                      />
                                    )}
                                </span>
                              ))}
                            </div>
                            ) : null}
                            {!isReadOnly && !mediaLinks.length ? (
                              <p className="classico-editor-modal__muted">Aggiungi link illimitati.</p>
                            ) : null}
                            {!isReadOnly ? (
                            <div className="classico-editor-modal__controls">
                              <div className="classico-editor-modal__link-row">
                                <input
                                  className="input"
                                  placeholder="URL link"
                                  value={linkDrafts[sub.id] ?? ""}
                                  onChange={(e) =>
                                    setLinkDrafts((prev) => ({
                                      ...prev,
                                      [sub.id]: e.target.value
                                    }))
                                  }
                                  disabled={!isSubVisible}
                                  style={{ flex: "1 1 220px" }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={handleSaveAll}
                                  disabled={isPending || !isSubVisible || !(linkDrafts[sub.id] ?? "").trim()}
                                >
                                  Aggiungi link
                                </button>
                              </div>
                              <span className="classico-editor-modal__hint">Premi Salva per aggiungere</span>
                            </div>
                          ) : null}
                          </div>
                        ) : null}

                        {!hideColazioneSubExtras ? (
                          <div className="classico-editor-modal__group" style={{ opacity: isSubVisible ? 1 : 0.55 }}>
                            <div className="classico-editor-modal__group-title">Allegati</div>
                            {mediaFiles.length ? (
                              <div className="classico-editor-modal__chips">
                                {mediaFiles.map((item) => (
                                  <span key={item.id} style={{ display: "grid", gap: 6 }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                      <a className="classico-editor-modal__chip" href={item.url} target="_blank" rel="noreferrer">
                                        Allegato - {getAttachmentLabel(item)}
                                      </a>
                                      {!isReadOnly ? (
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: "2px 6px", lineHeight: 1 }}
                                          onClick={() => handleDeleteMedia(item.id, sub.id)}
                                          disabled={isPending || isReadOnly}
                                          aria-label={`Elimina ${getAttachmentLabel(item)}`}
                                          title="Elimina"
                                        >
                                          x
                                        </button>
                                      ) : null}
                                    </span>
                                    {isReadOnly ? (
                                      item.description ? (
                                        <span className="classico-editor-modal__link-desc">{item.description}</span>
                                      ) : null
                                    ) : (
                                      <input
                                        className="input classico-editor-modal__comment-input"
                                        placeholder="Nome/descrizione (opzionale)"
                                        value={mediaCommentDrafts[item.id] ?? item.description ?? ""}
                                        onChange={(e) =>
                                          setMediaCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                        }
                                        disabled={!isSubVisible}
                                      />
                                    )}
                                  </span>
                                ))}
                              </div>
                            ) : !isReadOnly ? (
                              <p className="classico-editor-modal__muted">Aggiungi allegati (PDF, menu, istruzioni).</p>
                            ) : null}
                            {!isReadOnly ? (
                              <div className="classico-editor-modal__controls" style={{ marginTop: 6 }}>
                                <label
                                  className="btn btn-secondary"
                                  style={{ cursor: isSubVisible ? "pointer" : "not-allowed", opacity: isSubVisible ? 1 : 0.55 }}
                                >
                                  <input
                                    type="file"
                                    accept={ATTACHMENT_FILE_ACCEPT}
                                    multiple
                                    style={{ display: "none" }}
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files ?? []);
                                      if (!files.length) return;
                                      handleUploadAttachmentFiles(sub.id, files);
                                      e.currentTarget.value = "";
                                    }}
                                    disabled={!isSubVisible || uploadingAttachmentSubId === sub.id}
                                  />
                                  {uploadingAttachmentSubId === sub.id ? "Caricamento..." : "Carica allegato"}
                                </label>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
                )
              ) : null}
              {showColazioneSectionExtras ? (
                <div className="classico-editor-modal__list" style={{ marginBottom: 12 }}>
                  <div className="classico-editor-modal__group">
                    {colazioneLinks.length ? (
                      <div className="classico-editor-modal__chips" style={{ gap: 10 }}>
                        {colazioneLinks.map((item, idx) => (
                          <span
                            key={item.id || `${item.url}-${idx}`}
                            style={{ display: "grid", gap: 4, cursor: isReadOnly ? "default" : "grab" }}
                            draggable={!isReadOnly}
                            onDragStart={(event) => handleDragStart(event, activeSection.id, "link", item.id)}
                            onDragOver={handleDragOver}
                            onDrop={(event) => handleDrop(event, activeSection.id, "link", item.id, colazioneLinkIds)}
                            onDragEnd={() => setDragInfo(null)}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderEditorLinkChip({ url: item.url }, `${item.url}-${idx}`)}
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${item.url}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {item.description ? (
                              <span className="classico-editor-modal__muted classico-editor-modal__link-desc">{item.description}</span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">
                        Aggiungi link illimitati con descrizione (es. ristoranti, menu, prenotazioni).
                      </p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="URL link"
                          value={sectionColazioneLinkDrafts[activeSection.id]?.url ?? ""}
                          onChange={(e) =>
                            setSectionColazioneLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { description: "" }), url: e.target.value }
                            }))
                          }
                        />
                        <textarea
                          className="input classico-editor-modal__textarea"
                          placeholder="Descrizione del link (opzionale)"
                          rows={2}
                          value={sectionColazioneLinkDrafts[activeSection.id]?.description ?? ""}
                          onChange={(e) =>
                            setSectionColazioneLinkDrafts((prev) => ({
                              ...prev,
                              [activeSection.id]: { ...(prev[activeSection.id] ?? { url: "" }), description: e.target.value }
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleAddColazioneLink(activeSection.id)}
                          disabled={
                            isPending ||
                            isReadOnly ||
                            !(sectionColazioneLinkDrafts[activeSection.id]?.url?.trim())
                          }
                        >
                          Aggiungi link
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="classico-editor-modal__group">
                    <div className="classico-editor-modal__group-title">Allegati</div>
                    {colazioneAttachments.length ? (
                      <div className="classico-editor-modal__chips">
                        {colazioneAttachments.map((item) => (
                          <span key={item.id} style={{ display: "grid", gap: 6 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <a className="classico-editor-modal__chip" href={item.url} target="_blank" rel="noreferrer">
                                Allegato - {getAttachmentLabel(item)}
                              </a>
                              {!isReadOnly ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: "2px 6px", lineHeight: 1 }}
                                  onClick={() => handleDeleteMedia(item.id, activeSection.id)}
                                  disabled={isPending || isReadOnly}
                                  aria-label={`Elimina ${getAttachmentLabel(item)}`}
                                  title="Elimina"
                                >
                                  x
                                </button>
                              ) : null}
                            </span>
                            {isReadOnly ? (
                              item.description ? (
                                <span className="classico-editor-modal__link-desc">{item.description}</span>
                              ) : null
                            ) : (
                              <input
                                className="input classico-editor-modal__comment-input"
                                placeholder="Nome/descrizione (opzionale)"
                                value={mediaCommentDrafts[item.id] ?? item.description ?? ""}
                                onChange={(e) =>
                                  setMediaCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                              />
                            )}
                          </span>
                        ))}
                      </div>
                    ) : !isReadOnly ? (
                      <p className="classico-editor-modal__muted">Aggiungi allegati (PDF, menu, istruzioni).</p>
                    ) : null}
                    {!isReadOnly ? (
                      <div className="classico-editor-modal__controls" style={{ marginTop: 6 }}>
                        <label
                          className="btn btn-secondary"
                          style={{
                            cursor: uploadingAttachmentSectionId === activeSection.id ? "not-allowed" : "pointer",
                            opacity: uploadingAttachmentSectionId === activeSection.id ? 0.55 : 1
                          }}
                        >
                          <input
                            type="file"
                            accept={ATTACHMENT_FILE_ACCEPT}
                            multiple
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              if (!files.length) return;
                              handleUploadSectionAttachmentFiles(activeSection.id, files);
                              e.currentTarget.value = "";
                            }}
                            disabled={uploadingAttachmentSectionId === activeSection.id}
                          />
                          {uploadingAttachmentSectionId === activeSection.id ? "Caricamento..." : "Carica allegato"}
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            </fieldset>
          </div>
        </div>
      ) : null}
      {previewIndex !== null ? (
        <div className="media-lightbox" role="dialog" aria-modal="true" onClick={() => setPreviewIndex(null)}>
          <div className="media-lightbox__backdrop" />
          <button
            type="button"
            className="media-lightbox__close"
            onClick={(e) => { e.stopPropagation(); setPreviewIndex(null); }}
            aria-label="Chiudi"
          >
            x
          </button>
          <button
            type="button"
            className="media-lightbox__nav media-lightbox__prev"
            onClick={(e) => { e.stopPropagation();
              setPreviewIndex((current) =>
                current === null ? null : (current - 1 + previewItems.length) % previewItems.length
              );
            }}
            aria-label="Immagine precedente"
          >
            {"<"}
          </button>
          <img className="media-lightbox__image" src={previewItems[previewIndex]} alt="" onClick={(e) => e.stopPropagation()} />
          <button
            type="button"
            className="media-lightbox__nav media-lightbox__next"
            onClick={(e) => { e.stopPropagation();
              setPreviewIndex((current) =>
                current === null ? null : (current + 1) % previewItems.length
              );
            }}
            aria-label="Immagine successiva"
          >
            {">"}
          </button>
        </div>
      ) : null}
    </section>
  );
}





