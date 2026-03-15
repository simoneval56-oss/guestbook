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

test.describe("Auth e link ospite critici", () => {
  test.beforeAll(() => {
    fixture = readFixtureOrThrow();
  });

  test("login espone il recupero password e accetta la richiesta di reset", async ({ page }) => {
    const runSuffix = fixture.runId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
    const email = `e2e-reset-${runSuffix}-${Date.now().toString(36)}@guesthomebook.it`;

    await page.goto("/login");
    await page.getByRole("link", { name: "Password dimenticata?" }).click();
    await page.waitForURL("**/forgot-password");

    await page.locator('input[type="email"]').fill(email);
    await page.getByRole("button", { name: "Invia link di reset" }).click();

    await expect(
      page.getByText("Se l'email esiste, ti abbiamo inviato un link per reimpostare la password.")
    ).toBeVisible();
  });

  test("reset password senza token mostra link non valido", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("Link non valido")).toBeVisible();
    await expect(page.getByRole("link", { name: "Richiedi un nuovo reset password" })).toBeVisible();
  });

  test("registrazione, login e logout funzionano", async ({ page }) => {
    test.slow();

    const runSuffix = fixture.runId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase();
    const nonce = Date.now().toString(36);
    const emailDomain = resolveRegistrationEmailDomain();
    const email = `e2e-register-${runSuffix}-${nonce}@${emailDomain}`;
    const password = `E2E-${nonce}-Pass!1`;

    try {
      await page.goto("/register");
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.locator('input[type="checkbox"]').check();
      const registerResponsePromise = page.waitForResponse((response) => {
        return response.url().includes("/api/auth/register") && response.request().method() === "POST";
      });
      await page.getByRole("button", { name: "Registrati" }).click();
      const registerResponse = await registerResponsePromise;
      const payload = await registerResponse.json().catch(() => ({}));

      if (registerResponse.ok() && payload?.needsEmailConfirmation) {
        await expect(
          page.getByText("Ti abbiamo inviato un link di conferma via email. Aprilo e poi accedi con le tue credenziali.")
        ).toBeVisible();
        await confirmAuthUserEmail(email);
        await loginWithCredentials(page, email, password);
      } else if (!registerResponse.ok() && /rate limit/i.test(String(payload?.error ?? ""))) {
        await createConfirmedAuthUser(email, password);
        await loginWithCredentials(page, email, password);
      } else if (registerResponse.ok()) {
        await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
      } else {
        throw new Error(`Registrazione fallita: ${String(payload?.error ?? registerResponse.status())}`);
      }

      await expect(page.getByText(email)).toBeVisible();
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/"),
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
