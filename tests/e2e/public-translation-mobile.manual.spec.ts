import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFixtureOrThrow, type E2EFixture } from "./utils/fixture-store";
import { getEnv } from "./utils/env";
import { setHomebookLayoutType } from "./utils/supabase-fixtures";

type HomebookTranslationPayload = {
  homebook?: { title?: string | null };
  sections?: Array<{ id: string; title: string }>;
  subsections?: Array<{ id: string; content_text: string }>;
};

type LayoutTranslationResult = {
  lang: string;
  overflow: boolean;
  chipCount: number;
  activeFound: boolean;
  hasAutoTag: boolean;
  markerFound: boolean;
  markerSamples: string[];
};

const LAYOUTS = [
  "classico",
  "rustico",
  "mediterraneo",
  "moderno",
  "illustrativo",
  "pastello",
  "futuristico",
  "notturno",
  "oro",
  "romantico"
];

const MOBILE_VIEWPORT = { width: 390, height: 844 };

let fixture: E2EFixture;
let admin: ReturnType<typeof createClient>;
let homebookId: string;
let publicSlug: string;
let publicToken: string;

function createAdminClient() {
  const { url, serviceRoleKey } = {
    url: getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY")
  };

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE env variables missing for e2e admin client");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function parseTranslationLanguages() {
  const source = (getEnv("TRANSLATION_SOURCE_LANG") ?? "it").trim().toLowerCase() || "it";
  const configured = (getEnv("TRANSLATION_TARGET_LANGS") ?? "").split(",").map((item) => item.trim().toLowerCase());
  const langs = Array.from(new Set(configured.filter(Boolean))).filter((lang) => lang !== source);

  if (langs.length === 0) {
    throw new Error("No translation languages configured. Set TRANSLATION_TARGET_LANGS.");
  }

  return { sourceLanguage: source, targetLanguages: langs };
}

function parseSubsectionText(raw: string | null | undefined) {
  const safe = raw ?? "";
  try {
    const parsed = JSON.parse(safe);
    if (parsed && typeof parsed.title === "string" && typeof parsed.body === "string") {
      return {
        title: normalizeText(parsed.title),
        body: normalizeText(parsed.body)
      };
    }
  } catch {
    // ignore parsing failures
  }

  return {
    title: normalizeText(safe),
    body: ""
  };
}

async function ensureTranslationFixtureHomebook() {
  const homebook = await admin
    .from("homebooks")
    .insert({
      property_id: fixture.ownerA.propertyId,
      title: `E2E Traduzioni Mobile ${fixture.runId}`,
      layout_type: "classico",
      public_slug: `e2e-mobile-${fixture.runId}`.slice(0, 40),
      public_access_token: randomToken(),
      public_access_enabled: true,
      is_published: true
    })
    .select("id, public_slug, public_access_token")
    .single();

  if (homebook.error || !homebook.data) {
    throw new Error(`Unable to create e2e homebook: ${homebook.error?.message || "unknown"}`);
  }

  homebookId = homebook.data.id;
  publicSlug = homebook.data.public_slug;
  publicToken = homebook.data.public_access_token;

  const sections = [
    {
      title: "Check-in",
      order: 1,
      subsection: {
        title: "Orario",
        body: "L'arrivo avviene dalle 15:00 alle 20:00 e il check-in termina alle 22:00."
      }
    },
    {
      title: "Formalità",
      order: 2,
      subsection: {
        title: "Documenti",
        body: "Si prega di presentare un documento valido al momento dell'arrivo."
      }
    },
    {
      title: "Regole struttura",
      order: 3,
      subsection: {
        title: "Regole",
        body: "Fumo consentito solo all'esterno, check-out entro le 10:00 e silenzio dopo le 23:00."
      }
    }
  ];

  for (const section of sections) {
    const sec = await admin
      .from("sections")
      .insert({
        homebook_id: homebookId,
        title: section.title,
        order_index: section.order,
        visible: true
      })
      .select("id")
      .single();

    if (sec.error || !sec.data) {
      throw new Error(`Unable to create section ${section.title}: ${sec.error?.message || "unknown"}`);
    }

    const sub = await admin.from("subsections").insert({
      section_id: sec.data.id,
      content_text: JSON.stringify({
        title: section.subsection.title,
        body: section.subsection.body
      }),
      visible: true,
      order_index: 1
    });

    if (sub.error) {
      throw new Error(`Unable to create subsection for ${section.title}: ${sub.error.message}`);
    }
  }
}

function randomToken() {
  return `t-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

async function cleanupFixtureHomebook() {
  if (!homebookId) return;

  await admin.from("homebook_translations").delete().eq("homebook_id", homebookId);
  await admin.from("homebook_versions").delete().eq("homebook_id", homebookId);
  await admin.from("homebooks").delete().eq("id", homebookId);
}

async function getTranslationMarkers(homebookId: string, versionNo: number, lang: string) {
  const translation = await admin
    .from("homebook_translations")
    .select("payload")
    .eq("homebook_id", homebookId)
    .eq("version_no", versionNo)
    .eq("target_lang", lang)
    .eq("status", "ready")
    .maybeSingle();

  if (translation.error || !translation.data?.payload) {
    return [];
  }

  const payload = translation.data.payload as HomebookTranslationPayload;
  const markers: string[] = [];

  if (payload.homebook?.title) markers.push(normalizeText(payload.homebook.title));
  if (Array.isArray(payload.sections) && payload.sections.length > 0 && payload.sections[0]?.title) {
    markers.push(normalizeText(payload.sections[0].title));
  }
  const firstSubsection = Array.isArray(payload.subsections) ? payload.subsections[0] : null;
  if (firstSubsection?.content_text) {
    const parsed = parseSubsectionText(firstSubsection.content_text);
    if (parsed.title) markers.push(parsed.title);
    if (parsed.body) markers.push(parsed.body);
  }

  return Array.from(new Set(markers.filter(Boolean)));
}

async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(fixture.ownerA.email);
  await page.locator('input[type="password"]').fill(fixture.ownerA.password);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 60_000 }),
    page.getByRole("button", { name: "Entra" }).click()
  ]);
}

async function evaluateMobileLayout(page: Page, lang: string) {
  const link = `${lang === "it" ? `/p/${publicSlug}?t=${publicToken}` : `/p/${publicSlug}?t=${publicToken}&lang=${lang}`}`;

  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  return page.evaluate(({ langCode, sourceLang }) => {
    const normalizeText = (value) => (value || "").replace(/\s+/g, " ").trim();
    const bodyText = normalizeText(document.body.innerText || "");
    const viewportWidth = Math.ceil(window.innerWidth || 0);
    const scrollWidth = Math.ceil(document.documentElement.scrollWidth || 0);

    const langLinks = Array.from(document.querySelectorAll("a")).filter((link) => {
      const href = link.getAttribute("href") || "";
      return href.includes("/p/") && href.includes("?t=");
    });

    const chips = langLinks.filter((link) => {
      const rect = link.getBoundingClientRect();
      return rect.width >= 1 && rect.height >= 1;
    });

    const active = langLinks.find((link) => {
      const href = link.getAttribute("href") || "";
      const isCurrent = href.includes(`lang=${langCode}`) || (langCode === sourceLang && !href.includes("&lang="));
      return isCurrent && link.getAttribute("aria-current") === "true";
    });

    return {
      text: bodyText,
      overflow: scrollWidth > viewportWidth + 2,
      chipCount: chips.length,
      activeFound: Boolean(active),
      hasAutoTag: bodyText.includes("Traduzione automatica")
    };
  }, { langCode: lang, sourceLang: fixtureSourceLanguage });
}

let fixtureSourceLanguage = "it";
let translationLanguages: string[] = [];

const { sourceLanguage, targetLanguages } = parseTranslationLanguages();
fixtureSourceLanguage = sourceLanguage;
translationLanguages = targetLanguages;

test.describe("Verifica traduzioni homebook in mobile", () => {
  test.describe.configure({ mode: "serial", timeout: 420_000 });

  test.beforeAll(() => {
    fixture = readFixtureOrThrow();
    admin = createAdminClient();
    translationLanguages = parseTranslationLanguages().targetLanguages;
    fixtureSourceLanguage = parseTranslationLanguages().sourceLanguage;
  });

  test.beforeAll(async () => {
    await ensureTranslationFixtureHomebook();
  });

  test.afterAll(async () => {
    await cleanupFixtureHomebook();
  });

  test("layout 10 homebook: controlli mobile su tutte le lingue", async ({ page }) => {
    await loginAsOwner(page);

    const basePage = await page.context().newPage();
    const langPage = await page.context().newPage();

    for (const layout of LAYOUTS) {
      await setHomebookLayoutType(homebookId, layout);

      const publishResponse = await page.request.post(`/api/homebooks/${homebookId}/publish`, {
        data: { action: "publish" }
      });
      expect(publishResponse.status()).toBe(200);

      const publishPayload = await publishResponse.json();
      const translationSummary = (publishPayload as { data?: { translations?: { requested: number; ready: number; failed: number } } }).data?.translations;
      expect(translationSummary?.requested).toBeGreaterThan(0);
      expect(translationSummary?.ready).toBe(translationSummary.requested);
      expect(translationSummary?.failed).toBe(0);

      const { data: latestVersion } = await admin
        .from("homebook_versions")
        .select("version_no")
        .eq("homebook_id", homebookId)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(latestVersion?.version_no).toBeGreaterThan(0);
      const versionNo = latestVersion!.version_no as number;

      const baseline = await evaluateMobileLayout(basePage, fixtureSourceLanguage);
      expect(baseline.overflow).toBe(false);
      expect(baseline.chipCount).toBeGreaterThanOrEqual(2);
      expect(baseline.text).toContain(fixture.ownerA.propertyName);

      for (const lang of translationLanguages) {
        const marks = await getTranslationMarkers(homebookId, versionNo, lang);
        expect(marks.length).toBeGreaterThan(0);

        const result = (await evaluateMobileLayout(langPage, lang)) as LayoutTranslationResult;
        expect(result.overflow).toBe(false);
        expect(result.chipCount).toBeGreaterThanOrEqual(2);
        expect(result.activeFound).toBe(true);
        expect(result.hasAutoTag).toBe(true);

        const matches = marks.some((marker) => marker && result.text.includes(marker));
        expect(matches).toBe(true);
      }
    }

    await basePage.close();
    await langPage.close();
  });
});