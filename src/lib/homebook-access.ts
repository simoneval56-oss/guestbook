import "server-only";

export function generatePublicAccessToken() {
  return crypto.randomUUID().replace(/-/g, "");
}
