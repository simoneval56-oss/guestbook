import type { FullConfig } from "@playwright/test";
import { clearFixtureFile, readFixture } from "./utils/fixture-store";
import { destroyE2EFixture } from "./utils/supabase-fixtures";

async function globalTeardown(_: FullConfig) {
  const fixture = readFixture();
  if (fixture) {
    await destroyE2EFixture(fixture);
  }
  clearFixtureFile();
}

export default globalTeardown;
