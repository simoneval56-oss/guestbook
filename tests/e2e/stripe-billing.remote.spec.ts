import { expect, test, type Locator, type Page } from "@playwright/test";
import Stripe from "stripe";
import {
  createConfirmedAuthUser,
  deleteAuthUserByEmail,
  waitForUserBillingState,
  type UserBillingState
} from "./utils/supabase-fixtures";
import { getEnv, getRequiredEnv } from "./utils/env";

const REMOTE_BASE_URL = getRequiredEnv("E2E_BASE_URL").trim().replace(/\/+$/, "");
const REMOTE_HOST = new URL(REMOTE_BASE_URL).hostname.toLowerCase();
const E2E_VERCEL_BYPASS_SECRET = getEnv("E2E_VERCEL_BYPASS_SECRET")?.trim() ?? null;

if (REMOTE_HOST === "guesthomebook.it" || REMOTE_HOST === "www.guesthomebook.it") {
  throw new Error("Remote Stripe smoke test must not run against production.");
}

const STRIPE_SECRET_KEY = getRequiredEnv("STRIPE_SECRET_KEY");

if (!STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error("Remote Stripe smoke test requires a Stripe test secret key.");
}

const STRIPE_CARD_NUMBER = getEnv("E2E_STRIPE_CARD_NUMBER") ?? "4242424242424242";
const STRIPE_CARD_EXPIRY = getEnv("E2E_STRIPE_CARD_EXPIRY") ?? "1234";
const STRIPE_CARD_CVC = getEnv("E2E_STRIPE_CARD_CVC") ?? "123";
const STRIPE_CARD_NAME = getEnv("E2E_STRIPE_CARD_NAME") ?? "GuestHomeBook Test";
const STRIPE_CARD_POSTAL_CODE = getEnv("E2E_STRIPE_CARD_POSTAL_CODE") ?? "00100";

const ACTIVE_OR_RECOVERABLE_STATUSES = new Set(["active", "trial", "past_due"]);

function createStripeTestClient() {
  return new Stripe(STRIPE_SECRET_KEY);
}

function withVercelBypass(pathname: string) {
  if (!E2E_VERCEL_BYPASS_SECRET) return pathname;

  const target = new URL(pathname, `${REMOTE_BASE_URL}/`);
  target.searchParams.set("x-vercel-protection-bypass", E2E_VERCEL_BYPASS_SECRET);
  target.searchParams.set("x-vercel-set-bypass-cookie", "true");
  return target.toString();
}

async function loginWithCredentials(page: Page, email: string, password: string) {
  await page.goto(withVercelBypass("/login"));
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Entra" }).click()
  ]);
}

async function tryFillLocator(locator: Locator, value: string) {
  try {
    if ((await locator.count()) === 0) return false;
    await locator.first().fill(value, { timeout: 1_000 });
    return true;
  } catch {
    return false;
  }
}

async function fillStripeField(page: Page, selectors: string[], value: string, optional = false) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      if (await tryFillLocator(page.locator(selector), value)) {
        return;
      }
    }

    for (const frame of page.frames()) {
      const frameUrl = frame.url();
      if (!frameUrl.includes("js.stripe.com") || !frameUrl.includes("elements-inner")) continue;

      for (const selector of selectors) {
        if (await tryFillLocator(frame.locator(selector), value)) {
          return;
        }
      }
    }

    await page.waitForTimeout(250);
  }

  if (!optional) {
    throw new Error(`Unable to locate Stripe field for selectors: ${selectors.join(", ")}`);
  }
}

async function fillStripeHostedCheckout(page: Page) {
  const cardRadio = page.getByRole("radio", { name: /Carta|Card/i });
  if ((await cardRadio.count()) > 0) {
    await cardRadio.first().check();
  }

  await fillStripeField(
    page,
    [
      "input[autocomplete='cc-name']",
      "input[name='cardholderName']",
      "input[aria-label*='Nome sulla carta']",
      "input[aria-label*='Name on card']"
    ],
    STRIPE_CARD_NAME,
    true
  );

  await fillStripeField(
    page,
    [
      "input[autocomplete='cc-number']",
      "input[name='cardnumber']",
      "input[aria-label*='Numero carta']",
      "input[aria-label*='Card number']"
    ],
    STRIPE_CARD_NUMBER
  );
  await fillStripeField(
    page,
    [
      "input[autocomplete='cc-exp']",
      "input[name='exp-date']",
      "input[aria-label*='Scadenza']",
      "input[aria-label*='Expiry']",
      "input[aria-label*='MM / YY']"
    ],
    STRIPE_CARD_EXPIRY
  );
  await fillStripeField(
    page,
    [
      "input[autocomplete='cc-csc']",
      "input[name='cvc']",
      "input[aria-label*='Codice di sicurezza']",
      "input[aria-label*='Security code']",
      "input[aria-label*='CVC']"
    ],
    STRIPE_CARD_CVC
  );
  await fillStripeField(
    page,
    [
      "input[autocomplete='postal-code']",
      "input[name='postalCode']",
      "input[aria-label*='CAP']",
      "input[aria-label*='ZIP']",
      "input[aria-label*='Postal code']"
    ],
    STRIPE_CARD_POSTAL_CODE,
    true
  );
}

async function cancelStripeSubscriptionIfPresent(stripe: Stripe, subscriptionId: string | null | undefined) {
  if (!subscriptionId) return;

  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such subscription|already canceled|status of canceled/i.test(message)) {
      return;
    }
    throw error;
  }
}

test.describe("Stripe billing remoto", () => {
  test("checkout test, portal e sync webhook aggiornano lo stato utente", async ({ page }) => {
    test.slow();

    const stripe = createStripeTestClient();
    const nonce = Date.now().toString(36);
    const email = `stripe-remote-${nonce}@example.com`;
    const password = `Stripe-${nonce}-Pass!1`;

    let billingState: UserBillingState | null = null;

    try {
      await createConfirmedAuthUser(email, password);

      await loginWithCredentials(page, email, password);
      await expect(page.getByRole("button", { name: /Attiva abbonamento|Aggiorna piano/ })).toBeVisible();

      await Promise.all([
        page.waitForURL((url) => url.hostname.includes("stripe.com"), { timeout: 60_000 }),
        page.getByRole("button", { name: /Attiva abbonamento|Aggiorna piano/ }).click()
      ]);

      await expect(page.getByRole("button", { name: /Paga e abbonati|Subscribe|Pay/i })).toBeVisible({
        timeout: 60_000
      });
      await fillStripeHostedCheckout(page);

      await Promise.all([
        page.waitForURL(
          (url) =>
            url.origin === REMOTE_BASE_URL &&
            url.pathname === "/dashboard" &&
            url.searchParams.get("billing") === "checkout_success",
          { timeout: 120_000 }
        ),
        page.getByRole("button", { name: /Paga e abbonati|Subscribe|Pay/i }).click()
      ]);

      billingState = await waitForUserBillingState(
        email,
        (state) =>
          Boolean(state?.stripeCustomerId) &&
          Boolean(state?.stripeSubscriptionId) &&
          ACTIVE_OR_RECOVERABLE_STATUSES.has((state?.subscriptionStatus ?? "").toLowerCase()),
        { timeoutMs: 120_000, intervalMs: 2_000 }
      );

      expect(billingState?.stripeCustomerId).toBeTruthy();
      expect(billingState?.stripeSubscriptionId).toBeTruthy();
      expect(ACTIVE_OR_RECOVERABLE_STATUSES.has((billingState?.subscriptionStatus ?? "").toLowerCase())).toBe(true);

      await expect(page.getByRole("button", { name: "Gestisci abbonamento" })).toBeVisible({ timeout: 60_000 });
      await Promise.all([
        page.waitForURL((url) => url.hostname.includes("stripe.com"), { timeout: 60_000 }),
        page.getByRole("button", { name: "Gestisci abbonamento" }).click()
      ]);
      expect(new URL(page.url()).hostname).toMatch(/stripe\.com$/);

      await cancelStripeSubscriptionIfPresent(stripe, billingState?.stripeSubscriptionId);

      const canceledState = await waitForUserBillingState(
        email,
        (state) => (state?.subscriptionStatus ?? "").toLowerCase() === "expired",
        { timeoutMs: 120_000, intervalMs: 2_000 }
      );
      expect((canceledState?.subscriptionStatus ?? "").toLowerCase()).toBe("expired");
    } finally {
      await cancelStripeSubscriptionIfPresent(stripe, billingState?.stripeSubscriptionId);
      await deleteAuthUserByEmail(email);
    }
  });
});
