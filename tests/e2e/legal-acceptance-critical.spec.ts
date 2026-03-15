import { expect, test, type Page } from "@playwright/test";
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from "../../src/lib/legal";
import { readFixtureOrThrow, type E2EFixture } from "./utils/fixture-store";
import {
  getUserLegalAcceptance,
  markUserLegalAcceptanceCurrent,
  setUserLegalAcceptanceState
} from "./utils/supabase-fixtures";

let fixture: E2EFixture;

const STALE_VERSION = "2026-03-01";
const STALE_ACCEPTED_AT = "2026-03-01T12:00:00.000Z";

async function loginAsOwnerA(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(fixture.ownerA.email);
  await page.locator('input[type="password"]').fill(fixture.ownerA.password);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Entra" }).click()
  ]);
  await page.waitForLoadState("networkidle");
}

test.describe("Riaccettazione documenti legali", () => {
  test.beforeAll(() => {
    fixture = readFixtureOrThrow();
  });

  test("utente con versioni obsolete vede il gate e lo sblocca", async ({ page }) => {
    test.slow();

    await setUserLegalAcceptanceState(fixture.ownerA.userId, {
      termsVersion: STALE_VERSION,
      acceptedAt: STALE_ACCEPTED_AT,
      source: "register"
    });

    try {
      await loginAsOwnerA(page);

      await expect(page.getByText("Accetta i documenti aggiornati")).toBeVisible();
      await expect(
        page.getByText("Accesso operativo sospeso finche non completi la riaccettazione dei documenti.")
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Accetta e continua" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Aggiungi struttura" })).toHaveCount(0);

      await Promise.all([
        page.waitForURL(/\/dashboard\?legal=updated$/),
        page.getByRole("button", { name: "Accetta e continua" }).click()
      ]);
      await page.waitForLoadState("networkidle");

      await expect(page.getByText("Documenti legali aggiornati accettati correttamente.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Aggiungi struttura" })).toBeVisible();

      const acceptance = await getUserLegalAcceptance(fixture.ownerA.userId);
      expect(acceptance.isCurrent).toBe(true);
      expect(acceptance.termsVersion).toBe(LEGAL_TERMS_VERSION);
      expect(acceptance.privacyVersion).toBe(LEGAL_PRIVACY_VERSION);
      expect(acceptance.source).toBe("renewal");
      expect(acceptance.termsAcceptedAt).not.toBe(STALE_ACCEPTED_AT);
      expect(acceptance.privacyAcceptedAt).not.toBe(STALE_ACCEPTED_AT);
    } finally {
      await markUserLegalAcceptanceCurrent(fixture.ownerA.userId);
    }
  });
});
