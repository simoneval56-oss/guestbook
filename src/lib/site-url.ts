function normalizeSiteUrl(value: string | null | undefined) {
  const normalized = (value ?? "").trim().replace(/\/+$/, "");
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}

export function getSiteUrl() {
  return (
    normalizeSiteUrl(process.env.NEXT_PUBLIC_BASE_URL) ??
    normalizeSiteUrl(process.env.VERCEL_BRANCH_URL) ??
    normalizeSiteUrl(process.env.VERCEL_URL) ??
    normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    "https://www.guesthomebook.it"
  );
}
