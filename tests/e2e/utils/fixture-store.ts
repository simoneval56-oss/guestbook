import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type E2EOwnerFixture = {
  email: string;
  password: string;
  userId: string;
  propertyId: string;
  propertyName: string;
  homebookId: string;
  homebookTitle: string;
  publicSlug: string;
  publicToken: string;
};

export type E2EFixture = {
  runId: string;
  ownerA: E2EOwnerFixture;
  ownerB: E2EOwnerFixture;
};

const FIXTURE_DIR = join(process.cwd(), "tests", "e2e", ".fixtures");
const FIXTURE_FILE = join(FIXTURE_DIR, "current.json");

export function getFixturePath() {
  return FIXTURE_FILE;
}

export function writeFixture(fixture: E2EFixture) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2), "utf8");
}

export function readFixture() {
  if (!existsSync(FIXTURE_FILE)) return null;
  const raw = readFileSync(FIXTURE_FILE, "utf8");
  return JSON.parse(raw) as E2EFixture;
}

export function readFixtureOrThrow() {
  const fixture = readFixture();
  if (!fixture) {
    throw new Error(
      `E2E fixture not found at ${FIXTURE_FILE}. Run tests via Playwright config with global setup enabled.`
    );
  }
  return fixture;
}

export function clearFixtureFile() {
  if (existsSync(FIXTURE_FILE)) {
    rmSync(FIXTURE_FILE, { force: true });
  }
}
