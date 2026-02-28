import { expect, test, type Page } from "@playwright/test";
import { readFixtureOrThrow, type E2EFixture } from "./utils/fixture-store";
import { getHomebookPublishedState } from "./utils/supabase-fixtures";

let fixture: E2EFixture;

function extractPublicPath(linkText: string) {
  const match = linkText.match(/\/p\/([^?\s]+)\?t=([A-Za-z0-9]+)/);
  if (!match) {
    throw new Error(`Unable to parse public link from: ${linkText}`);
  }
  const slug = match[1];
  const token = match[2];
  return {
    slug,
    token,
    path: `/p/${slug}?t=${token}`
  };
}

async function loginAsOwnerA(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(fixture.ownerA.email);
  await page.locator('input[type="password"]').fill(fixture.ownerA.password);
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Entra" }).click()
  ]);
}

test.describe("Accessi critici", () => {
  test.beforeAll(() => {
    fixture = readFixtureOrThrow();
  });

  test("ospite non modifica mai nulla", async ({ page, request }) => {
    const before = await getHomebookPublishedState(fixture.ownerA.homebookId);

    await page.goto(`/p/${fixture.ownerA.publicSlug}?t=${fixture.ownerA.publicToken}`);
    await expect(page.getByText(fixture.ownerA.propertyName)).toBeVisible();
    await expect(page.getByRole("button", { name: "Salva e pubblica" })).toHaveCount(0);

    const response = await request.post(`/api/homebooks/${fixture.ownerA.homebookId}/publish`, {
      data: { action: "draft" }
    });
    expect(response.status()).toBe(401);

    const after = await getHomebookPublishedState(fixture.ownerA.homebookId);
    expect(after).toBe(before);
  });

  test("proprietario vede solo le proprie strutture", async ({ page }) => {
    await loginAsOwnerA(page);

    await expect(page.locator(".structure-summary__name").filter({ hasText: fixture.ownerA.propertyName })).toBeVisible();
    await expect(page.getByText(fixture.ownerA.homebookTitle)).toBeVisible();

    await expect(page.locator(".structure-summary__name").filter({ hasText: fixture.ownerB.propertyName })).toHaveCount(0);

    const ownEditResponse = await page.goto(`/homebooks/${fixture.ownerA.homebookId}/edit`);
    expect(ownEditResponse?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/homebooks/${fixture.ownerA.homebookId}/edit$`));
    await expect(page.getByRole("link", { name: "<- Dashboard" })).toBeVisible();

    const response = await page.goto(`/homebooks/${fixture.ownerB.homebookId}/edit`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("token ruotato invalida il vecchio link", async ({ page }) => {
    await loginAsOwnerA(page);

    const card = page.locator(".card").filter({ hasText: fixture.ownerA.homebookTitle }).first();
    const linkCode = card.locator("code").first();
    const oldLinkText = ((await linkCode.textContent()) ?? "").trim();
    const oldPublic = extractPublicPath(oldLinkText);

    await card.getByRole("button", { name: "Rigenera link" }).click();
    await page.waitForLoadState("networkidle");
    await expect(linkCode).not.toHaveText(oldLinkText);

    const newLinkText = ((await linkCode.textContent()) ?? "").trim();
    const newPublic = extractPublicPath(newLinkText);
    expect(newPublic.token).not.toBe(oldPublic.token);

    await page.goto(oldPublic.path);
    await expect(page.getByText("This page could not be found.")).toBeVisible();

    await page.goto(newPublic.path);
    await expect(page.getByText(fixture.ownerA.propertyName)).toBeVisible();
  });
});
