import { expect, test, type Page } from "@playwright/test";
import { readFixtureOrThrow, type E2EFixture } from "./utils/fixture-store";
import { getHomebookPublicAccess, setHomebookLayoutType } from "./utils/supabase-fixtures";

type ContrastIssue = {
  selector: string;
  text: string;
  ratio: number;
  threshold: number;
  color: string;
  background: string;
  fontSize: number;
  fontWeight: number;
};

type ContrastReport = {
  checked: number;
  issues: ContrastIssue[];
};

const MAIN_LAYOUTS = ["classico", "moderno", "mediterraneo", "futuristico", "notturno", "romantico"] as const;

const PRIMARY_SELECTORS = [
  ".public-homebook-cover__title",
  ".public-homebook-cover__address",
  ".public-homebook-cover__description",
  ".classico-title",
  ".classico-subtitle",
  ".base-hero__title",
  ".base-hero__subtitle",
  ".section-panel__title",
  ".section-panel__subtitle",
  ".section-button__title",
  ".section-button__hint",
  ".classico-card__title",
  ".homebook-search__input"
];

const MODAL_SELECTORS = [
  ".classico-editor-modal__title",
  ".classico-editor-modal__sub-heading",
  ".classico-editor-modal__sub-text",
  ".section-modal__title",
  ".section-modal__sub-title",
  ".subsection-block__text"
];

let fixture: E2EFixture;

function formatContrastIssues(layout: string, issues: ContrastIssue[]) {
  if (issues.length === 0) return "";
  const lines = issues.slice(0, 30).map((issue) => {
    return `- [${layout}] ${issue.selector} | text="${issue.text}" | ratio=${issue.ratio.toFixed(2)} < ${issue.threshold.toFixed(2)} | fg=${issue.color} bg=${issue.background} | font=${issue.fontSize}px/${issue.fontWeight}`;
  });
  const truncated = issues.length > 30 ? `\n- ...and ${issues.length - 30} more` : "";
  return `Low contrast text detected:\n${lines.join("\n")}${truncated}`;
}

async function runContrastScan(page: Page, selectors: string[]): Promise<ContrastReport> {
  const report = await page.evaluate(({ selectorsToCheck }) => {
    function parseColor(raw: string) {
      const value = (raw || "").trim().toLowerCase();
      if (!value) return null;
      if (value === "transparent") return [0, 0, 0, 0];
      if (value.startsWith("#")) {
        const hex = value.slice(1);
        if (hex.length === 3 || hex.length === 4) {
          const r = Number.parseInt(hex[0] + hex[0], 16);
          const g = Number.parseInt(hex[1] + hex[1], 16);
          const b = Number.parseInt(hex[2] + hex[2], 16);
          const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
          return [r, g, b, a];
        }
        if (hex.length === 6 || hex.length === 8) {
          const r = Number.parseInt(hex.slice(0, 2), 16);
          const g = Number.parseInt(hex.slice(2, 4), 16);
          const b = Number.parseInt(hex.slice(4, 6), 16);
          const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
          return [r, g, b, a];
        }
      }
      const rgbaMatch = value.match(/^rgba?\(([^)]+)\)$/);
      if (!rgbaMatch) return null;
      const parts = rgbaMatch[1].split(",").map((part) => part.trim());
      if (parts.length < 3) return null;
      const r = Number.parseFloat(parts[0]);
      const g = Number.parseFloat(parts[1]);
      const b = Number.parseFloat(parts[2]);
      const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
      if ([r, g, b, a].some((channel) => Number.isNaN(channel))) return null;
      return [r, g, b, a];
    }

    function composite(top: number[], bottom: number[]) {
      const alphaTop = Math.max(0, Math.min(1, top[3]));
      const alphaBottom = Math.max(0, Math.min(1, bottom[3]));
      const outAlpha = alphaTop + alphaBottom * (1 - alphaTop);
      if (outAlpha <= 0) return [0, 0, 0, 0];
      const red = (top[0] * alphaTop + bottom[0] * alphaBottom * (1 - alphaTop)) / outAlpha;
      const green = (top[1] * alphaTop + bottom[1] * alphaBottom * (1 - alphaTop)) / outAlpha;
      const blue = (top[2] * alphaTop + bottom[2] * alphaBottom * (1 - alphaTop)) / outAlpha;
      return [red, green, blue, outAlpha];
    }

    function toRgbString(color: number[]) {
      return `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`;
    }

    function toLinear(channel: number) {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function luminance(color: number[]) {
      return 0.2126 * toLinear(color[0]) + 0.7152 * toLinear(color[1]) + 0.0722 * toLinear(color[2]);
    }

    function contrastRatio(a: number[], b: number[]) {
      const bright = Math.max(luminance(a), luminance(b));
      const dark = Math.min(luminance(a), luminance(b));
      return (bright + 0.05) / (dark + 0.05);
    }

    function isVisible(element: Element) {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (Number.parseFloat(style.opacity || "1") === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    }

    function getTextLabel(element: Element) {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const value = (element.value || element.placeholder || element.getAttribute("aria-label") || element.name || element.id || "").trim();
        return value;
      }
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      return text;
    }

    function resolveBackgroundColor(element: Element) {
      const layers: number[][] = [];
      let current: Element | null = element;
      while (current) {
        const style = window.getComputedStyle(current);
        const color = parseColor(style.backgroundColor);
        if (color && color[3] > 0) {
          layers.push(color);
        }
        current = current.parentElement;
      }
      let background = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        background = composite(layers[i], background);
      }
      return background;
    }

    const issues: ContrastIssue[] = [];
    let checked = 0;

    selectorsToCheck.forEach((selector) => {
      const candidates = Array.from(document.querySelectorAll(selector)).slice(0, 40);
      candidates.forEach((element) => {
        if (!isVisible(element)) return;

        const label = getTextLabel(element);
        if (!label) return;

        const style = window.getComputedStyle(element);
        const textColorRaw = parseColor(style.color);
        if (!textColorRaw) return;

        const backgroundColor = resolveBackgroundColor(element);
        const effectiveTextColor = composite(textColorRaw, backgroundColor);
        const ratio = contrastRatio(effectiveTextColor, backgroundColor);

        const fontSize = Number.parseFloat(style.fontSize || "16");
        const parsedWeight = Number.parseInt(style.fontWeight || "400", 10);
        const fontWeight = Number.isNaN(parsedWeight) ? 400 : parsedWeight;
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const threshold = isLargeText ? 3 : 4.5;

        checked += 1;
        if (ratio + 1e-6 < threshold) {
          issues.push({
            selector,
            text: label.length > 80 ? `${label.slice(0, 77)}...` : label,
            ratio,
            threshold,
            color: toRgbString(effectiveTextColor),
            background: toRgbString(backgroundColor),
            fontSize,
            fontWeight
          });
        }
      });
    });

    return { checked, issues };
  }, { selectorsToCheck: selectors });

  return report as ContrastReport;
}

async function openFirstSection(page: Page) {
  const trigger = page.locator(".classico-card, .section-button").first();
  if ((await trigger.count()) === 0) return;
  await trigger.click();
  await page
    .locator(".classico-editor-modal__card, .section-modal__card")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .catch(() => undefined);
}

test.describe("Contrasto UI layout principali", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    fixture = readFixtureOrThrow();
  });

  for (const layout of MAIN_LAYOUTS) {
    test(`layout ${layout} mantiene leggibilita testi`, async ({ page }) => {
      await setHomebookLayoutType(fixture.ownerA.homebookId, layout);
      const linkData = await getHomebookPublicAccess(fixture.ownerA.homebookId);

      await page.goto(`/p/${linkData.slug}?t=${linkData.token}`);
      await expect(page.locator(".public-homebook")).toBeVisible();
      await page.waitForLoadState("networkidle");

      const pageReport = await runContrastScan(page, PRIMARY_SELECTORS);
      expect(pageReport.checked, `No readable targets found for ${layout} on page scan`).toBeGreaterThan(0);

      await openFirstSection(page);
      const modalReport = await runContrastScan(page, MODAL_SELECTORS);

      const issues = [...pageReport.issues, ...modalReport.issues];
      expect(issues, formatContrastIssues(layout, issues)).toEqual([]);
    });
  }
});
