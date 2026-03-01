import { expect, test, type Page } from "@playwright/test";
import { readFixtureOrThrow, type E2EFixture } from "./utils/fixture-store";
import {
  confirmAuthUserEmail,
  createConfirmedAuthUser,
  deleteAuthUserByEmail,
  getHomebookPublicAccess
} from "./utils/supabase-fixtures";
import { getEnv } from "./utils/env";

let fixture: E2EFixture;

async function loginWithCredentials(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Entra" }).click()
  ]);
}

function resolveRegistrationEmailDomain() {
  const explicit = getEnv("E2E_SIGNUP_EMAIL_DOMAIN");
  if (explicit) return explicit;

  const baseUrl = getEnv("NEXT_PUBLIC_BASE_URL");
  if (!baseUrl) return "guesthomebook.it";
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return "guesthomebook.it";
    return host.replace(/^www\./, "");
  } catch {
    return "guesthomebook.it";
  }
}

async function waitRegistrationOutcome(page: Page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (page.url().includes("/dashboard")) {
      return { status: "dashboard" as const };
    }

    const feedbacks = await page.locator("form .text-muted").allTextContents();
    const feedback = feedbacks.map((text) => text.trim()).filter(Boolean).join(" | ");
    if (feedback.includes("Ti abbiamo inviato un link di conferma via email")) {
      return { status: "email-confirmation" as const };
    }
    if (/rate limit/i.test(feedback)) {
      return { status: "rate-limit" as const };
    }
    if (feedback.length > 0 && !/Attendere/i.test(feedback)) {
      return { status: "error" as const, feedback };
    }

    await page.waitForTimeout(250);
  }
  return { status: "timeout" as const };
}

test.describe("Auth e link ospite critici", () => {
  test.beforeAll(() => {
    fixture = readFixtureOrThrow();
  });

  test("registrazione, login e logout funzionano", async ({ page }) => {
    const runSuffix = fixture.runId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
    const nonce = Date.now().toString(36);
    const emailDomain = resolveRegistrationEmailDomain();
    const email = `e2e-register-${runSuffix}-${nonce}@${emailDomain}`;
    const password = `E2E-${nonce}-Pass!1`;

    try {
      await page.goto("/register");
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole("button", { name: "Registrati" }).click();
      const outcome = await waitRegistrationOutcome(page);

      if (outcome.status === "email-confirmation") {
        await confirmAuthUserEmail(email);
        await loginWithCredentials(page, email, password);
      } else if (outcome.status === "rate-limit") {
        await createConfirmedAuthUser(email, password);
        await loginWithCredentials(page, email, password);
      } else if (outcome.status === "dashboard") {
        // already authenticated by signup (email confirmation disabled)
      } else if (outcome.status === "error") {
        throw new Error(`Registrazione fallita: ${outcome.feedback}`);
      } else {
        throw new Error("Registrazione in timeout: nessun esito rilevato");
      }

      await expect(page.getByText(email)).toBeVisible();
      await Promise.all([
        page.waitForURL("**/"),
        page.getByRole("button", { name: "Logout" }).click()
      ]);
      await page.goto("/dashboard");
      await page.waitForURL("**/login");
      await expect(page.getByRole("button", { name: "Entra" })).toBeVisible();
    } finally {
      await deleteAuthUserByEmail(email);
    }
  });

  test("link ospite resta accessibile senza login", async ({ page }) => {
    const linkData = await getHomebookPublicAccess(fixture.ownerA.homebookId);
    await page.context().clearCookies();
    await page.goto(`/p/${linkData.slug}?t=${linkData.token}`);

    await expect(page.getByText(fixture.ownerA.propertyName)).toBeVisible();
    await expect(page.getByRole("button", { name: "Salva e pubblica" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Dashboard/i })).toHaveCount(0);
  });
});
