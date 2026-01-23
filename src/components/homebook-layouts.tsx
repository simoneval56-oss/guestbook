'use client';
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type MediaItem = {
  id: string;
  url: string;
  type: string;
  order_index?: number | null;
  description?: string | null;
};

type SubsectionBlock = {
  id: string;
  title?: string;
  content: string;
  media: MediaItem[];
};

export type SectionBlock = {
  id: string;
  title: string;
  order: number;
  media: MediaItem[];
  subsections: SubsectionBlock[];
};

type PropertyInfo = {
  name: string | null;
  address: string | null;
  mainImageUrl: string | null;
  shortDescription: string | null;
};

type LayoutProps = {
  homebook: {
    title: string;
    layoutType: string;
    property: PropertyInfo;
  };
  sections: SectionBlock[];
};

type LayoutVariant = "aurora" | "essenziale" | "boutique" | "classico" | "pastello";
type GridLayoutVariant = "classico" | "moderno" | "illustrativo" | "pastello";
type SectionVariant = LayoutVariant | GridLayoutVariant;

function slugifyTitle(title: string, fallback: string) {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug || fallback;
}

function resolvePrimaryImage(property: PropertyInfo, sections: SectionBlock[]) {
  const fromMedia = sections
    .flatMap((section) => [
      ...section.media.filter((item) => item.type === "image").map((item) => item.url),
      ...section.subsections.flatMap((sub) => sub.media.filter((item) => item.type === "image").map((item) => item.url))
    ])
    .find(Boolean);
  return property.mainImageUrl || fromMedia || null;
}

function normalizeHref(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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

function buildSectionSearchText(section: SectionBlock) {
  const parts: string[] = [section.title];
  section.media.forEach((item) => {
    if (item.description) parts.push(item.description);
    if (item.url) parts.push(item.url);
  });
  section.subsections.forEach((sub) => {
    if (sub.title) parts.push(sub.title);
    if (sub.content) parts.push(sub.content);
    sub.media.forEach((item) => {
      if (item.description) parts.push(item.description);
      if (item.url) parts.push(item.url);
    });
  });
  return parts.join(" ");
}

function useSectionSearch(sections: SectionBlock[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const searchNormalized = useMemo(() => normalizeSearchValue(searchTerm), [searchTerm]);
  const queryTokens = useMemo(
    () => (searchNormalized.tokens ? searchNormalized.tokens.split(" ").filter(Boolean) : []),
    [searchNormalized.tokens]
  );
  const filteredSections = useMemo(() => {
    if (!queryTokens.length) return sections;
    return sections.filter((section) =>
      matchesSearchValue(buildSectionSearchText(section), queryTokens, searchNormalized.compact)
    );
  }, [sections, queryTokens, searchNormalized.compact]);

  return {
    searchTerm,
    setSearchTerm,
    filteredSections,
    hasSearch: queryTokens.length > 0
  };
}

function resolveLinkData(item: MediaItem, allowJson = false) {
  if (item.type !== "link") {
    return { href: item.url, label: item.url, description: item.description ?? "" };
  }
  if (allowJson) {
    try {
      const parsed = JSON.parse(item.url || "{}");
      if (parsed && typeof parsed.url === "string") {
        const parsedDescription = typeof parsed.description === "string" ? parsed.description : "";
        const description = item.description ?? parsedDescription ?? "";
        return { href: normalizeHref(parsed.url), label: parsed.url, description };
      }
    } catch (e) {
      // ignore parsing errors
    }
  }
  return { href: normalizeHref(item.url), label: item.url, description: item.description ?? "" };
}

function getFileLabel(item: MediaItem) {
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

function MediaChip({ item, layoutSlug }: { item: MediaItem; layoutSlug?: string }) {
  const label =
    item.type === "video"
      ? "Video"
      : item.type === "link"
      ? "Link"
      : item.type === "file"
      ? "Allegato"
      : "Immagine";
  const linkData = item.type === "file"
    ? { href: item.url, label: getFileLabel(item), description: item.description ?? "" }
    : resolveLinkData(item, layoutSlug === "oro");
  return (
    <a className="media-chip" href={linkData.href} target="_blank" rel="noreferrer">
      <span className="media-chip__type">{label}</span>
      <span className="media-chip__url">{linkData.label}</span>
      {linkData.description ? <span className="media-chip__desc">{linkData.description}</span> : null}
    </a>
  );
}

function SectionModal({
  section,
  onClose,
  variant,
  layoutSlug
}: {
  section: SectionBlock;
  onClose: () => void;
  variant: LayoutVariant;
  layoutSlug?: string;
}) {
  const [previewItems, setPreviewItems] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const subMedia = section.subsections.flatMap((sub) => sub.media);
  const hasMedia = section.media.length > 0 || subMedia.length > 0;
  const sectionSlug = slugifyTitle(section.title, `section-${section.order}`);

  const renderMediaItem = (item: MediaItem) => {
    if (item.type === "image") {
      return (
        <div key={item.id} className="media-thumb-block">
          <button
            type="button"
            className="media-thumb"
            onClick={() => {
              const images = [section.media, subMedia]
                .flat()
                .filter((media) => media.type === "image")
                .map((media) => media.url);
              const startIndex = Math.max(0, images.indexOf(item.url));
              setPreviewItems(images);
              setPreviewIndex(startIndex);
            }}
            aria-label="Apri immagine"
          >
            <img src={item.url} alt="" loading="lazy" />
          </button>
          {item.description ? <span className="media-thumb__desc">{item.description}</span> : null}
        </div>
      );
    }
    return <MediaChip key={item.id} item={item} layoutSlug={layoutSlug} />;
  };

  return (
    <div className="section-modal" role="dialog" aria-modal="true" aria-label={`Dettagli ${section.title}`}>
      <div className="section-modal__backdrop" onClick={onClose} />
      <article
        className={`section-modal__card section-modal__card--${variant} section-modal__card--${sectionSlug}`}
        role="document"
      >
        <header className="section-modal__header">
          <div>
            <div className="section-modal__eyebrow">Sezione {section.order}</div>
            <h3 className={`section-modal__title section-modal__title--${sectionSlug}`}>{section.title}</h3>
          </div>
          <button type="button" className="btn btn-secondary section-modal__close" onClick={onClose}>
            Chiudi
          </button>
        </header>

        <div className="section-modal__body">
          {section.subsections.length === 0 ? (
            <p className="subsection-block__text">Nessuna informazione inserita in questa sezione.</p>
          ) : (
            section.subsections.map((sub, idx) => {
              const hasSubContent = Boolean(sub.content && sub.content.trim());
              const hasSubMedia = sub.media.length > 0;

              return (
                <article key={sub.id} className="subsection-block">
                  <div className="section-modal__sub-title">Nota {idx + 1}</div>
                  {hasSubContent ? (
                    <p className="subsection-block__text">{sub.content}</p>
                  ) : !hasSubMedia ? (
                    <p className="subsection-block__text">Nessuna informazione inserita.</p>
                  ) : null}
                  {hasSubMedia ? (
                    <div className="media-chip__group">
                      {sub.media.map(renderMediaItem)}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}

          {hasMedia ? (
            <div className="section-modal__media">
              <div className="section-modal__media-title">Media della sezione</div>
              <div className="media-chip__group">
                {section.media.map(renderMediaItem)}
                {subMedia.map(renderMediaItem)}
              </div>
            </div>
          ) : null}
        </div>
      </article>
      {previewIndex !== null ? (
        <div className="media-lightbox" role="dialog" aria-modal="true">
          <div className="media-lightbox__backdrop" />
          <button
            type="button"
            className="media-lightbox__close"
            onClick={() => setPreviewIndex(null)}
            aria-label="Chiudi"
          >
            x
          </button>
          <button
            type="button"
            className="media-lightbox__nav media-lightbox__prev"
            onClick={() =>
              setPreviewIndex((current) =>
                current === null ? null : (current - 1 + previewItems.length) % previewItems.length
              )
            }
            aria-label="Immagine precedente"
          >
            {"<"}
          </button>
          <img className="media-lightbox__image" src={previewItems[previewIndex]} alt="" />
          <button
            type="button"
            className="media-lightbox__nav media-lightbox__next"
            onClick={() =>
              setPreviewIndex((current) =>
                current === null ? null : (current + 1) % previewItems.length
              )
            }
            aria-label="Immagine successiva"
          >
            {">"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SectionButton({
  section,
  onOpen,
  isActive,
  variant = "classico",
  layoutSlug = ""
}: {
  section: SectionBlock;
  onOpen: () => void;
  isActive: boolean;
  variant?: SectionVariant;
  layoutSlug?: string;
}) {
  const sectionSlug = slugifyTitle(section.title, `section-${section.order}`);
  return (
    <button
      type="button"
      className={`section-button section-button--${sectionSlug}${isActive ? " is-active" : ""}`}
      onClick={onOpen}
    >
      {layoutSlug === "oro" ? (
        <SectionIcon title={section.title} order={section.order} variant={variant} layoutSlug={layoutSlug} />
      ) : null}
      <div className="section-button__meta">
        <span className="section-button__badge">{section.order}</span>
        <span className="section-button__label">Sezione</span>
      </div>
      <div className="section-button__title">{section.title}</div>
      <div className="section-button__hint">
        {section.subsections.length} sottosezioni / {section.media.length} media diretti
      </div>
    </button>
  );
}

const PASTELLO_ICON_MAP: Record<string, string[]> = {
  "check-in": ["/Icons/Pastello/check-in-1.png", "/Icons/Pastello/check-in.png"],
  "self-check-in": ["/Icons/Pastello/self-check-in.png"],
  "come-raggiungerci": ["/Icons/Pastello/come-raggiungerci.png"],
  "la-nostra-struttura": ["/Icons/Pastello/struttura.png"],
  funzionamento: ["/Icons/Pastello/funzionamento.png"],
  "regole-struttura": ["/Icons/Pastello/regole.png"],
  "dove-bere": ["/Icons/Pastello/bar.png"],
  "dove-mangiare": ["/Icons/Pastello/ristorante.png"],
  "cosa-visitare": ["/Icons/Pastello/cosa-visitare.png"],
  esperienze: ["/Icons/Pastello/esperienze-1.png"],
  spiagge: ["/Icons/Pastello/spiaggia.png"],
  servizi: ["/Icons/Pastello/servizi.png"],
  "numeri-utili": ["/Icons/Pastello/telefono.png"],
  "check-out": ["/Icons/Pastello/check-out.png"],
  shopping: ["/Icons/Pastello/negozio.png"],
  "camera-da-letto": ["/Icons/Pastello/letto.png"]
};

function getPastelloCandidates(slug: string) {
  return PASTELLO_ICON_MAP[slug] ?? [];
}

const ICON_SLUG_ALIASES: Record<string, string[]> = {
  "check-in": ["check-in-1", "check-in-3"],
  "check-out": ["check-out-1png"],
  documenti: ["documenti-1"],
  shopping: ["negozio"],
  "numeri-utili": ["telefono"],
  "self-check-in": ["selfcheck-in"]
};

function SectionIcon({
  title,
  order,
  variant = "classico",
  layoutSlug = ""
}: {
  title: string;
  order: number;
  variant?: SectionVariant;
  layoutSlug?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const [iconIndex, setIconIndex] = useState(0);
  const slug = slugifyTitle(title, `sezione-${order}`);
  const isIllustrativo = variant === "illustrativo";
  const isModerno = variant === "moderno" || isIllustrativo;
  const isPastello = variant === "pastello";
  const isOro = layoutSlug === "oro";

  const iconCandidates = useMemo(() => {
    if (isOro) {
      return ["/Icons/Oro/esperienze.png"];
    }

    const candidates = new Set<string>();

    const pushCandidate = (path?: string) => {
      if (path) {
        candidates.add(path);
      }
    };

    if (isIllustrativo) {
      pushCandidate("/Icons/Illustrativo/fotocamera.png");
    }
    if (isIllustrativo || isModerno) {
      pushCandidate("/Icons/Moderno/esperienze.png?v=1");
    }
    pushCandidate("/Icons/Classico/cosa-visitare.png");

    const folderOrder = isIllustrativo
      ? ["Illustrativo", "Moderno", "Classico"]
      : isModerno
      ? ["Moderno", "Classico"]
      : isPastello
      ? ["Pastello", "Classico"]
      : ["Classico"];

    folderOrder.forEach((folder) => {
      pushCandidate(`/Icons/${folder}/${slug}.svg`);
      pushCandidate(`/Icons/${folder}/${slug}.png`);
    });

    const aliasNames = ICON_SLUG_ALIASES[slug] ?? [];
    aliasNames.forEach((alias) => {
      ["Pastello", "Illustrativo", "Moderno", "Classico"].forEach((folder) => {
        pushCandidate(`/Icons/${folder}/${alias}.png`);
        pushCandidate(`/Icons/${folder}/${alias}.svg`);
      });
    });

    if (isPastello) {
      getPastelloCandidates(slug).forEach(pushCandidate);
    }

    pushCandidate(`/Icons/${slug}.svg`);
    pushCandidate(`/Icons/${slug}.png`);

    return Array.from(candidates);
  }, [slug, isIllustrativo, isModerno, isPastello, isOro]);

  const iconSrc = iconCandidates[iconIndex] ?? iconCandidates[0] ?? "";

  const hasThickerStroke = slug === "check-in" || slug === "come-raggiungerci" || slug === "la-nostra-struttura";
  const hasBolderStroke = isModerno;

  return (
    <div className="classico-card__icon" aria-hidden="true">
      {!hasError && iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          className={`classico-card__icon-img${hasThickerStroke ? " icon-thicker" : ""}${hasBolderStroke ? " icon-bolder" : ""}`}
          onError={() => {
            const nextIndex = iconIndex + 1;
            if (nextIndex < iconCandidates.length) {
              setIconIndex(nextIndex);
            } else setHasError(true);
          }}
          loading="lazy"
        />
      ) : (
        <span className="classico-card__icon-fallback">{order}</span>
      )}
    </div>
  );
}

function BaseTemplateLayout({
  variant,
  homebook,
  sections
}: LayoutProps & {
  variant: LayoutVariant;
}) {
  const { property } = homebook;
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const { searchTerm, setSearchTerm, filteredSections, hasSearch } = useSectionSearch(sections);
  const layoutSlug = (homebook.layoutType || "").toLowerCase();
  const layoutClassName = `public-homebook base-layout base-layout--${variant}${
    layoutSlug ? ` public-homebook--${layoutSlug}` : ""
  }`;
  const openSection = useMemo(
    () => sections.find((section) => section.id === openSectionId) ?? null,
    [openSectionId, sections]
  );
  const trimmedSearch = searchTerm.trim();
  const searchStatus = hasSearch
    ? filteredSections.length
      ? `Risultati: ${filteredSections.length}`
      : `Nessun risultato per "${trimmedSearch}"`
    : "";

  useEffect(() => {
    if (!hasSearch || !openSectionId) return;
    if (!filteredSections.some((section) => section.id === openSectionId)) {
      setOpenSectionId(null);
    }
  }, [filteredSections, hasSearch, openSectionId]);

  const fallbackImage = useMemo(() => resolvePrimaryImage(property, sections), [property, sections]);

  return (
    <div className={layoutClassName}>
      <header className="base-hero">
        <div className="base-hero__content">
          <div className="base-hero__eyebrow">Homebook - {homebook.layoutType}</div>
          <h1 className="base-hero__title">{homebook.title}</h1>
          <p className="base-hero__subtitle">
            {property.shortDescription ||
              "Benvenuto nella guida digitale della casa: regole, istruzioni e suggerimenti in un solo posto."}
          </p>
          <div className="base-hero__meta">
            {property.name ? <span>{property.name}</span> : null}
            {property.address ? <span>{property.address}</span> : null}
          </div>
        </div>
        <div className="base-hero__photo" aria-hidden="true">
          {fallbackImage ? (
            <Image
              src={fallbackImage}
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 460px"
              style={{ objectFit: "cover" }}
              priority
              unoptimized
            />
          ) : null}
        </div>
      </header>

      <section className="section-panel">
        <div className="section-panel__header">
          <div>
            <div className="pill">Scegli una sezione</div>
            <h2 className="section-panel__title">Tutte le sezioni principali</h2>
            <p className="section-panel__subtitle">
              Clicca sul bottone di interesse per aprire la scheda con le sottosezioni e i media dedicati.
            </p>
            {sections.length > 0 ? (
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
          </div>
        </div>

        {filteredSections.length === 0 ? (
          <div className="empty-card">
            {hasSearch ? "Nessuna sezione trovata." : "Nessuna sezione ancora disponibile."}
          </div>
        ) : (
          <div className="section-button-grid">
            {filteredSections.map((section) => (
              <SectionButton
                key={section.id}
                section={section}
                isActive={openSectionId === section.id}
                onOpen={() => setOpenSectionId(section.id)}
                variant={variant}
                layoutSlug={layoutSlug}
              />
            ))}
          </div>
        )}
      </section>

      {openSection ? (
        <SectionModal section={openSection} onClose={() => setOpenSectionId(null)} variant={variant} layoutSlug={layoutSlug} />
      ) : null}
    </div>
  );
}

export function ClassicoLayout({
  homebook,
  sections,
  variant = "classico"
}: LayoutProps & { variant?: GridLayoutVariant }) {
  const { property } = homebook;
  const layoutSlug = (homebook.layoutType || "").toLowerCase();
  const isModerno = variant === "moderno";
  const isIllustrativo = variant === "illustrativo";
  const isPastello = variant === "pastello";
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const { searchTerm, setSearchTerm, filteredSections, hasSearch } = useSectionSearch(sections);
  const openSection = useMemo(
    () => sections.find((section) => section.id === openSectionId) ?? null,
    [openSectionId, sections]
  );

  const coverImage = useMemo(() => resolvePrimaryImage(property, sections), [property, sections]);
  const headingTitle = property.name || homebook.title;
  const headingSubtitle = property.shortDescription || homebook.title;
  const modalVariant: LayoutVariant = isPastello ? "pastello" : "classico";
  const layoutClassName = `public-homebook classico-layout${isModerno ? " moderno-layout" : ""}${
    isIllustrativo ? " illustrativo-layout" : ""
  }${isPastello ? " pastello-layout public-homebook--pastello" : ""}`;
  const trimmedSearch = searchTerm.trim();
  const searchStatus = hasSearch
    ? filteredSections.length
      ? `Risultati: ${filteredSections.length}`
      : `Nessun risultato per "${trimmedSearch}"`
    : "";

  useEffect(() => {
    if (!hasSearch || !openSectionId) return;
    if (!filteredSections.some((section) => section.id === openSectionId)) {
      setOpenSectionId(null);
    }
  }, [filteredSections, hasSearch, openSectionId]);

  return (
    <div className={layoutClassName}>
      <section className={`classico-sections${isModerno ? " moderno-sections" : ""}${isIllustrativo ? " illustrativo-sections" : ""}${isPastello ? " pastello-sections" : ""}`}>
        <div className={`classico-sections__panel${isModerno ? " moderno-sections__panel" : ""}${isIllustrativo ? " illustrativo-sections__panel" : ""}${isPastello ? " pastello-sections__panel" : ""}`}>
          <div className={`classico-sections__content${isModerno ? " moderno-sections__content" : ""}${isIllustrativo ? " illustrativo-sections__content" : ""}${isPastello ? " pastello-sections__content" : ""}`}>
            {sections.length > 0 ? (
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
              <div className={`classico-sections__grid${isModerno ? " moderno-sections__grid" : ""}${isIllustrativo ? " illustrativo-sections__grid" : ""}${isPastello ? " pastello-sections__grid" : ""}`}>
                {filteredSections.map((section) => {
                  const sectionSlug = slugifyTitle(section.title, `sezione-${section.order}`);
                  const extraClass = sectionSlug === "la-nostra-struttura" ? " classico-card--white" : "";
                  const slugClass = ` classico-card--slug-${sectionSlug}`;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={`classico-card${extraClass}${slugClass}${isModerno ? " moderno-card" : ""}${isIllustrativo ? " illustrativo-card" : ""}${isPastello ? " pastello-card" : ""}`}
                      onClick={() => setOpenSectionId(section.id)}
                    >
                      <SectionIcon title={section.title} order={section.order} variant={variant} layoutSlug={layoutSlug} />
                      <span className="classico-card__title">{section.title}</span>
                      <span className="classico-card__chevron" aria-hidden="true">
                        &gt;
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={`classico-hero${isModerno ? " moderno-hero" : ""}${isIllustrativo ? " illustrativo-hero" : ""}${isPastello ? " pastello-hero" : ""}`}>
        <div className={`classico-cover${isModerno ? " moderno-cover" : ""}${isIllustrativo ? " illustrativo-cover" : ""}${isPastello ? " pastello-cover" : ""}`}>
          {coverImage ? (
            <Image
              src={coverImage}
              alt=""
              fill
              sizes="(max-width: 1200px) 100vw, 1040px"
              style={{ objectFit: "cover" }}
              priority
              unoptimized
            />
          ) : (
            <div className={`classico-cover__placeholder${isModerno ? " moderno-cover__placeholder" : ""}${isIllustrativo ? " illustrativo-cover__placeholder" : ""}${isPastello ? " pastello-cover__placeholder" : ""}`} aria-hidden="true">
              <svg
                width="156"
                height="124"
                viewBox="0 0 156 124"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="4" y="20" width="148" height="100" rx="10" stroke="#5e5e5e" strokeWidth="8" />
                <path
                  d="M22 90L58 56L86 82L106 66L138 92"
                  stroke="#5e5e5e"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="54" cy="42" r="10" stroke="#5e5e5e" strokeWidth="8" />
              </svg>
            </div>
          )}
        </div>
        <div className={`classico-heading${isModerno ? " moderno-heading" : ""}${isIllustrativo ? " illustrativo-heading" : ""}${isPastello ? " pastello-heading" : ""}`}>
          <h1 className={`classico-title${isModerno ? " moderno-title" : ""}${isIllustrativo ? " illustrativo-title" : ""}${isPastello ? " pastello-title" : ""}`}>{headingTitle}</h1>
          <p className={`classico-subtitle${isModerno ? " moderno-subtitle" : ""}${isIllustrativo ? " illustrativo-subtitle" : ""}${isPastello ? " pastello-subtitle" : ""}`}>
            {headingSubtitle || "Benvenuto nella tua guida classica della struttura."}
          </p>
        </div>
      </div>

      {openSection ? (
        <SectionModal section={openSection} onClose={() => setOpenSectionId(null)} variant={modalVariant} layoutSlug={layoutSlug} />
      ) : null}
    </div>
  );
}

export function ModernoLayout(props: LayoutProps) {
  return <ClassicoLayout {...props} variant="moderno" />;
}

export function AuroraLayout(props: LayoutProps) {
  return <BaseTemplateLayout {...props} variant="aurora" />;
}

export function EssenzialeLayout(props: LayoutProps) {
  return <BaseTemplateLayout {...props} variant="essenziale" />;
}

export function BoutiqueLayout(props: LayoutProps) {
  return <BaseTemplateLayout {...props} variant="boutique" />;
}
