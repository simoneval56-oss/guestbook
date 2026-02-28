import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type EnvMap = Record<string, string>;

let cached: EnvMap | null = null;

function parseEnvFile(content: string) {
  const parsed: EnvMap = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    const value =
      (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    parsed[key] = value;
  });
  return parsed;
}

function loadLocalEnv() {
  if (cached) return cached;

  const files = [".env.local", ".env"];
  const merged: EnvMap = {};
  files.forEach((file) => {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) return;
    const content = readFileSync(path, "utf8");
    Object.assign(merged, parseEnvFile(content));
  });
  cached = merged;
  return merged;
}

export function getEnv(name: string) {
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.length > 0) {
    return fromProcess;
  }
  const local = loadLocalEnv()[name];
  if (typeof local === "string" && local.length > 0) {
    return local;
  }
  return null;
}

export function getRequiredEnv(name: string) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getSupabaseEnv() {
  return {
    url: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  };
}
