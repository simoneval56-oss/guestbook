import "server-only";

import { createHash } from "node:crypto";
import { Json } from "./database.types";

export type HomebookSnapshot = {
  homebook: {
    title: string;
    layout_type: string;
  };
  property: {
    name: string;
    address: string | null;
    main_image_url: string | null;
    short_description: string | null;
  };
  sections: Array<{
    id: string;
    title: string;
    order_index: number;
    visible: boolean | null;
  }>;
  subsections: Array<{
    id: string;
    section_id: string;
    content_text: string;
    visible: boolean | null;
    order_index: number | null;
    created_at: string | null;
  }>;
  media: Array<{
    id: string;
    section_id: string | null;
    subsection_id: string | null;
    url: string;
    type: string;
    order_index: number | null;
    description: string | null;
    created_at: string | null;
  }>;
};

export type HomebookTranslationPayload = {
  homebook: {
    title: string;
  };
  property: {
    name: string;
    address: string | null;
    short_description: string | null;
  };
  sections: Array<{
    id: string;
    title: string;
  }>;
  subsections: Array<{
    id: string;
    content_text: string;
  }>;
  media: Array<{
    id: string;
    description: string | null;
  }>;
};

export type HomebookTranslationRow = {
  homebook_id: string;
  version_no: number;
  source_lang: string;
  target_lang: string;
  content_hash: string;
  payload: HomebookTranslationPayload;
  status: "ready" | "error";
  error_message: string | null;
};

export type GuestLanguageOption = {
  code: string;
  label: string;
  flag: string;
  flagCountry: string | null;
};

type TranslationFieldRef = {
  source: string;
  assign: (translated: string) => void;
};

const FALLBACK_SOURCE_LANGUAGE = "it";
const MAX_LIBRETRANSLATE_BATCH = 40;
const MAX_DEEPL_BATCH = 50;

type TranslationProvider = "libretranslate" | "deepl";

const LANGUAGE_META: Record<string, { label: string; flag: string; flagCountry: string }> = {
  it: { label: "Italiano", flag: "\u{1F1EE}\u{1F1F9}", flagCountry: "it" },
  en: { label: "English", flag: "\u{1F1EC}\u{1F1E7}", flagCountry: "gb" },
  fr: { label: "Francais", flag: "\u{1F1EB}\u{1F1F7}", flagCountry: "fr" },
  de: { label: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}", flagCountry: "de" },
  es: { label: "Espanol", flag: "\u{1F1EA}\u{1F1F8}", flagCountry: "es" },
  pt: { label: "Portugues", flag: "\u{1F1F5}\u{1F1F9}", flagCountry: "pt" },
  ru: { label: "Russian", flag: "\u{1F1F7}\u{1F1FA}", flagCountry: "ru" },
  nl: { label: "Nederlands", flag: "\u{1F1F3}\u{1F1F1}", flagCountry: "nl" },
  ro: { label: "Romana", flag: "\u{1F1F7}\u{1F1F4}", flagCountry: "ro" },
  ja: { label: "Japanese", flag: "\u{1F1EF}\u{1F1F5}", flagCountry: "jp" },
  zh: { label: "Chinese", flag: "\u{1F1E8}\u{1F1F3}", flagCountry: "cn" }
};

function normalizeLanguageCode(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getConfiguredTranslationProvider(): TranslationProvider {
  const configured = (process.env.TRANSLATION_PROVIDER ?? "").trim().toLowerCase();
  return configured === "deepl" ? "deepl" : "libretranslate";
}

function isLibreTranslateConfigured() {
  return Boolean((process.env.LIBRETRANSLATE_URL ?? "").trim());
}

function isDeepLConfigured() {
  return Boolean((process.env.DEEPL_API_KEY ?? "").trim());
}

function mapLanguageToDeepL(code: string) {
  const normalized = normalizeLanguageCode(code);
  const mapped: Record<string, string> = {
    it: "IT",
    en: "EN",
    fr: "FR",
    de: "DE",
    es: "ES",
    pt: "PT-PT",
    ru: "RU",
    nl: "NL",
    ro: "RO",
    ja: "JA",
    zh: "ZH",
    "zh-hans": "ZH",
    "zh-cn": "ZH",
    "zh-hant": "ZH",
    "zh-tw": "ZH"
  };
  return mapped[normalized] ?? normalized.toUpperCase();
}

function getLanguageMeta(code: string) {
  return LANGUAGE_META[code] ?? { label: code.toUpperCase(), flag: "\u{1F310}", flagCountry: "" };
}

function isNonEmptyText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function parseStructuredSubsection(value: string | null | undefined) {
  const safe = value ?? "";
  try {
    const parsed = JSON.parse(safe);
    if (parsed && typeof parsed.title === "string" && typeof parsed.body === "string") {
      return { title: parsed.title, body: parsed.body };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeKnownSubsectionTitle(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (normalized === "formalita" || normalized === "formalit") return "FormalitÃƒÂ ";
  if (normalized === "accessibilita" || normalized === "accessibilit") return "AccessibilitÃƒÂ ";
  return value;
}

function normalizeKnownSubsectionTitleInText(value: string) {
  if (!value) return value;
  const lines = value.split("\n");
  if (!lines.length) return value;
  const normalizedFirstLine = normalizeKnownSubsectionTitle(lines[0] ?? "");
  if (normalizedFirstLine === lines[0]) return value;
  lines[0] = normalizedFirstLine;
  return lines.join("\n");
}

function buildTranslationPayload(snapshot: HomebookSnapshot): {
  payload: HomebookTranslationPayload;
  fields: TranslationFieldRef[];
} {
  const payload: HomebookTranslationPayload = {
    homebook: {
      title: snapshot.homebook.title ?? ""
    },
    property: {
      name: snapshot.property.name ?? "",
      address: snapshot.property.address ?? null,
      short_description: snapshot.property.short_description ?? null
    },
    sections: snapshot.sections.map((section) => ({
      id: section.id,
      title: section.title ?? ""
    })),
    subsections: [],
    media: snapshot.media.map((item) => ({
      id: item.id,
      description: item.description ?? null
    }))
  };

  const fields: TranslationFieldRef[] = [];

  if (isNonEmptyText(payload.homebook.title)) {
    fields.push({
      source: payload.homebook.title,
      assign: (translated) => {
        payload.homebook.title = translated;
      }
    });
  }
  if (isNonEmptyText(payload.property.name)) {
    fields.push({
      source: payload.property.name,
      assign: (translated) => {
        payload.property.name = translated;
      }
    });
  }
  if (isNonEmptyText(payload.property.address)) {
    fields.push({
      source: payload.property.address,
      assign: (translated) => {
        payload.property.address = translated;
      }
    });
  }
  if (isNonEmptyText(payload.property.short_description)) {
    fields.push({
      source: payload.property.short_description,
      assign: (translated) => {
        payload.property.short_description = translated;
      }
    });
  }

  payload.sections.forEach((section) => {
    if (!isNonEmptyText(section.title)) return;
    fields.push({
      source: section.title,
      assign: (translated) => {
        section.title = translated;
      }
    });
  });

  snapshot.subsections.forEach((subsection) => {
    const structured = parseStructuredSubsection(subsection.content_text);
    if (structured) {
      const mutable = {
        ...structured,
        title: normalizeKnownSubsectionTitle(structured.title)
      };
      const entry = {
        id: subsection.id,
        content_text: JSON.stringify(mutable)
      };
      payload.subsections.push(entry);
      if (isNonEmptyText(mutable.title)) {
        fields.push({
          source: mutable.title,
          assign: (translated) => {
            mutable.title = translated;
            entry.content_text = JSON.stringify(mutable);
          }
        });
      }
      if (isNonEmptyText(mutable.body)) {
        fields.push({
          source: mutable.body,
          assign: (translated) => {
            mutable.body = translated;
            entry.content_text = JSON.stringify(mutable);
          }
        });
      }
      return;
    }

    const entry = {
      id: subsection.id,
      content_text: normalizeKnownSubsectionTitleInText(subsection.content_text ?? "")
    };
    payload.subsections.push(entry);
    if (!isNonEmptyText(entry.content_text)) return;
    fields.push({
      source: entry.content_text,
      assign: (translated) => {
        entry.content_text = translated;
      }
    });
  });

  payload.media.forEach((item) => {
    if (!isNonEmptyText(item.description)) return;
    fields.push({
      source: item.description,
      assign: (translated) => {
        item.description = translated;
      }
    });
  });

  return { payload, fields };
}

async function translateWithLibreTranslate({
  texts,
  sourceLanguage,
  targetLanguage
}: {
  texts: string[];
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const baseUrl = (process.env.LIBRETRANSLATE_URL ?? "").trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("missing_libretranslate_url");
  }

  const apiKey = (process.env.LIBRETRANSLATE_API_KEY ?? "").trim();
  const batches = chunkArray(texts, MAX_LIBRETRANSLATE_BATCH);
  const translated: string[] = [];

  for (const batch of batches) {
    const response = await fetch(`${baseUrl}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: batch,
        source: sourceLanguage,
        target: targetLanguage,
        format: "text",
        api_key: apiKey || undefined
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`libretranslate_request_failed:${response.status}:${errorBody}`);
    }

    const json = await response.json().catch(() => null);
    if (!json) {
      throw new Error("libretranslate_invalid_response");
    }

    if (Array.isArray(json.translatedText)) {
      translated.push(...json.translatedText.map((value: unknown) => String(value ?? "")));
      continue;
    }

    if (typeof json.translatedText === "string" && batch.length === 1) {
      translated.push(json.translatedText);
      continue;
    }

    if (Array.isArray(json) && json.every((entry) => entry && typeof entry.translatedText === "string")) {
      translated.push(...json.map((entry) => String(entry.translatedText)));
      continue;
    }

    throw new Error("libretranslate_unexpected_payload");
  }

  if (translated.length !== texts.length) {
    throw new Error("libretranslate_count_mismatch");
  }

  return translated;
}

async function translateWithDeepL({
  texts,
  sourceLanguage,
  targetLanguage
}: {
  texts: string[];
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const apiKey = (process.env.DEEPL_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("missing_deepl_api_key");
  }

  const baseUrl = (process.env.DEEPL_API_URL ?? "https://api-free.deepl.com").trim().replace(/\/$/, "");
  const endpoint = `${baseUrl}/v2/translate`;
  const source = mapLanguageToDeepL(sourceLanguage);
  const target = mapLanguageToDeepL(targetLanguage);
  const batches = chunkArray(texts, MAX_DEEPL_BATCH);
  const translated: string[] = [];

  for (const batch of batches) {
    const body = new URLSearchParams();
    body.set("source_lang", source);
    body.set("target_lang", target);
    batch.forEach((text) => body.append("text", text));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `DeepL-Auth-Key ${apiKey}`
      },
      body: body.toString(),
      cache: "no-store"
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`deepl_request_failed:${response.status}:${errorBody}`);
    }

    const json = await response.json().catch(() => null);
    if (!json || !Array.isArray(json.translations)) {
      throw new Error("deepl_invalid_response");
    }

    const batchTexts = json.translations
      .map((entry: unknown) => {
        if (entry && typeof entry === "object" && typeof (entry as { text?: unknown }).text === "string") {
          return (entry as { text: string }).text;
        }
        return null;
      })
      .filter((entry: string | null): entry is string => entry !== null);

    translated.push(...batchTexts);
  }

  if (translated.length !== texts.length) {
    throw new Error("deepl_count_mismatch");
  }

  return translated;
}

async function translateTexts({
  texts,
  sourceLanguage,
  targetLanguage
}: {
  texts: string[];
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const provider = getConfiguredTranslationProvider();

  if (provider === "deepl") {
    try {
      return await translateWithDeepL({
        texts,
        sourceLanguage,
        targetLanguage
      });
    } catch (deepLError: any) {
      if (!isLibreTranslateConfigured()) {
        throw deepLError;
      }
      return translateWithLibreTranslate({
        texts,
        sourceLanguage,
        targetLanguage
      });
    }
  }

  return translateWithLibreTranslate({
    texts,
    sourceLanguage,
    targetLanguage
  });
}

function computeContentHash(snapshot: HomebookSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function getSourceLanguage() {
  const configured = normalizeLanguageCode(process.env.TRANSLATION_SOURCE_LANG);
  return configured || FALLBACK_SOURCE_LANGUAGE;
}

export function getTargetLanguages() {
  const source = getSourceLanguage();
  const configured = (process.env.TRANSLATION_TARGET_LANGS ?? "")
    .split(",")
    .map((item) => normalizeLanguageCode(item))
    .filter(Boolean);
  return Array.from(new Set(configured)).filter((code) => code !== source);
}

export function getGuestLanguageOptions() {
  const source = getSourceLanguage();
  const codes = [source, ...getTargetLanguages()];
  const uniqueCodes = Array.from(new Set(codes));
  return uniqueCodes.map((code) => {
    const meta = getLanguageMeta(code);
    return {
      code,
      label: meta.label,
      flag: meta.flag,
      flagCountry: meta.flagCountry || null
    };
  });
}

export function isTranslationEnabled() {
  if (getTargetLanguages().length === 0) return false;

  const provider = getConfiguredTranslationProvider();
  if (provider === "deepl") {
    return isDeepLConfigured() || isLibreTranslateConfigured();
  }

  return isLibreTranslateConfigured();
}

export function resolveGuestLanguage(requested: string | null | undefined) {
  const normalized = normalizeLanguageCode(requested);
  const source = getSourceLanguage();
  const available = new Set(getGuestLanguageOptions().map((option) => option.code));
  if (!normalized || !available.has(normalized)) {
    return source;
  }
  return normalized;
}

export async function buildTranslatedPayload({
  snapshot,
  sourceLanguage,
  targetLanguage
}: {
  snapshot: HomebookSnapshot;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const { payload, fields } = buildTranslationPayload(snapshot);
  const sourceTexts = fields.map((field) => field.source);
  if (!sourceTexts.length || sourceLanguage === targetLanguage) {
    return payload;
  }

  const translatedTexts = await translateTexts({
    texts: sourceTexts,
    sourceLanguage,
    targetLanguage
  });

  fields.forEach((field, index) => {
    const translated = translatedTexts[index];
    field.assign(isNonEmptyText(translated) ? translated : field.source);
  });

  return payload;
}

export async function generateHomebookTranslations({
  admin,
  homebookId,
  versionNo,
  snapshot
}: {
  admin: any;
  homebookId: string;
  versionNo: number;
  snapshot: HomebookSnapshot;
}) {
  const sourceLanguage = getSourceLanguage();
  const targetLanguages = getTargetLanguages();
  const contentHash = computeContentHash(snapshot);
  const now = new Date().toISOString();
  const results: Array<{ language: string; ok: boolean; error?: string }> = [];

  for (const targetLanguage of targetLanguages) {
    try {
      const payload = await buildTranslatedPayload({
        snapshot,
        sourceLanguage,
        targetLanguage
      });
      const { error } = await admin.from("homebook_translations").upsert(
        {
          homebook_id: homebookId,
          version_no: versionNo,
          source_lang: sourceLanguage,
          target_lang: targetLanguage,
          content_hash: contentHash,
          payload,
          status: "ready",
          error_message: null,
          created_at: now,
          updated_at: now
        },
        {
          onConflict: "homebook_id,version_no,target_lang"
        }
      );
      if (error) {
        throw error;
      }
      results.push({ language: targetLanguage, ok: true });
    } catch (error: any) {
      const message = typeof error?.message === "string" ? error.message : "translation_failed";
      await admin.from("homebook_translations").upsert(
        {
          homebook_id: homebookId,
          version_no: versionNo,
          source_lang: sourceLanguage,
          target_lang: targetLanguage,
          content_hash: contentHash,
          payload: {
            homebook: { title: snapshot.homebook.title ?? "" },
            property: {
              name: snapshot.property.name ?? "",
              address: snapshot.property.address ?? null,
              short_description: snapshot.property.short_description ?? null
            },
            sections: [],
            subsections: [],
            media: []
          },
          status: "error",
          error_message: message,
          created_at: now,
          updated_at: now
        },
        {
          onConflict: "homebook_id,version_no,target_lang"
        }
      );
      results.push({ language: targetLanguage, ok: false, error: message });
    }
  }

  return results;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function parseTranslationPayload(value: Json | null | undefined): HomebookTranslationPayload | null {
  if (!isObject(value)) return null;
  const homebook = isObject(value.homebook) ? value.homebook : null;
  const property = isObject(value.property) ? value.property : null;
  const sections = Array.isArray(value.sections) ? value.sections : null;
  const subsections = Array.isArray(value.subsections) ? value.subsections : null;
  const media = Array.isArray(value.media) ? value.media : null;
  if (!homebook || !property || !sections || !subsections || !media) return null;

  return {
    homebook: {
      title: asString(homebook.title)
    },
    property: {
      name: asString(property.name),
      address: asNullableString(property.address),
      short_description: asNullableString(property.short_description)
    },
    sections: sections
      .map((item) => {
        if (!isObject(item)) return null;
        return {
          id: asString(item.id),
          title: asString(item.title)
        };
      })
      .filter((item): item is { id: string; title: string } => item !== null),
    subsections: subsections
      .map((item) => {
        if (!isObject(item)) return null;
        return {
          id: asString(item.id),
          content_text: asString(item.content_text)
        };
      })
      .filter((item): item is { id: string; content_text: string } => item !== null),
    media: media
      .map((item) => {
        if (!isObject(item)) return null;
        return {
          id: asString(item.id),
          description: asNullableString(item.description)
        };
      })
      .filter((item): item is { id: string; description: string | null } => item !== null)
  };
}

export function applyTranslationPayload<
  THomebook extends {
    title: string;
    properties: {
      name: string | null;
      address: string | null;
      short_description: string | null;
    } | null;
  },
  TSection extends { id: string; title: string },
  TSubsection extends { id: string; content_text: string },
  TMedia extends { id: string; description: string | null }
>({
  payload,
  homebook,
  sections,
  subsections,
  media
}: {
  payload: HomebookTranslationPayload;
  homebook: THomebook;
  sections: TSection[];
  subsections: TSubsection[];
  media: TMedia[];
}) {
  const translatedHomebook: THomebook = {
    ...homebook,
    title: payload.homebook.title || homebook.title,
    properties: homebook.properties
      ? {
          ...homebook.properties,
          name: payload.property.name || homebook.properties.name,
          address: payload.property.address ?? homebook.properties.address,
          short_description: payload.property.short_description ?? homebook.properties.short_description
        }
      : homebook.properties
  };

  const sectionTitleMap = new Map(payload.sections.map((item) => [item.id, item.title]));
  const subsectionTextMap = new Map(payload.subsections.map((item) => [item.id, item.content_text]));
  const mediaDescriptionMap = new Map(payload.media.map((item) => [item.id, item.description]));

  const translatedSections = sections.map((section) => ({
    ...section,
    title: sectionTitleMap.get(section.id) || section.title
  }));
  const translatedSubsections = subsections.map((subsection) => ({
    ...subsection,
    content_text: subsectionTextMap.get(subsection.id) || subsection.content_text
  }));
  const translatedMedia = media.map((item) => ({
    ...item,
    description: mediaDescriptionMap.has(item.id) ? mediaDescriptionMap.get(item.id) ?? null : item.description
  }));

  return {
    homebook: translatedHomebook,
    sections: translatedSections,
    subsections: translatedSubsections,
    media: translatedMedia
  };
}
