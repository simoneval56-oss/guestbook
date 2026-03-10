export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return configured || "https://www.guesthomebook.it";
}
