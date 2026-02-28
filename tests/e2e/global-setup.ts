import type { FullConfig } from "@playwright/test";
import { createE2EFixture } from "./utils/supabase-fixtures";
import { writeFixture } from "./utils/fixture-store";

async function globalSetup(_: FullConfig) {
  const fixture = await createE2EFixture();
  writeFixture(fixture);
}

export default globalSetup;
