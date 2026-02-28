export const HOMEBOOK_MEDIA_BUCKET = "homebook-media";
export const HOMEBOOK_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

const STORAGE_REFERENCE_PREFIX = `storage://${HOMEBOOK_MEDIA_BUCKET}/`;
const STORAGE_OBJECT_PREFIXES = [
  `/storage/v1/object/public/${HOMEBOOK_MEDIA_BUCKET}/`,
  `/storage/v1/object/sign/${HOMEBOOK_MEDIA_BUCKET}/`,
  `/storage/v1/object/authenticated/${HOMEBOOK_MEDIA_BUCKET}/`
];
const RAW_OBJECT_PATH_PREFIXES = ["properties/", "sections/", "subsections/"];

function decodePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractStorageObjectPath(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  if (raw.startsWith(STORAGE_REFERENCE_PREFIX)) {
    const path = raw.slice(STORAGE_REFERENCE_PREFIX.length);
    return path ? decodePath(path) : null;
  }

  if (raw.startsWith(`${HOMEBOOK_MEDIA_BUCKET}/`)) {
    const path = raw.slice(HOMEBOOK_MEDIA_BUCKET.length + 1);
    return path ? decodePath(path) : null;
  }

  if (RAW_OBJECT_PATH_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    return decodePath(raw);
  }

  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    const matchedPrefix = STORAGE_OBJECT_PREFIXES.find((prefix) => url.pathname.startsWith(prefix));
    if (!matchedPrefix) return null;
    const path = url.pathname.slice(matchedPrefix.length);
    return path ? decodePath(path) : null;
  } catch {
    return null;
  }
}

export function isStorageMediaValue(value: string | null | undefined) {
  return extractStorageObjectPath(value) !== null;
}

export function buildStorageReference(path: string) {
  const cleanPath = path.trim().replace(/^\/+/, "");
  return `${STORAGE_REFERENCE_PREFIX}${cleanPath}`;
}

type SignedUrlResult = {
  signedUrl?: string | null;
  path?: string | null;
};

export async function createSignedUrlMapForValues(
  client: any,
  values: Array<string | null | undefined>,
  expiresInSeconds = HOMEBOOK_MEDIA_SIGNED_URL_TTL_SECONDS
) {
  const paths = Array.from(
    new Set(
      values
        .map((value) => extractStorageObjectPath(value))
        .filter((path): path is string => Boolean(path))
    )
  );

  const signedByPath = new Map<string, string>();
  if (!paths.length) return signedByPath;

  const { data } = await client.storage
    .from(HOMEBOOK_MEDIA_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  const rows: SignedUrlResult[] = Array.isArray(data) ? data : [];
  rows.forEach((row, index) => {
    const path = row.path ?? paths[index];
    const signedUrl = row.signedUrl ?? null;
    if (path && signedUrl) {
      signedByPath.set(path, signedUrl);
    }
  });

  return signedByPath;
}

export function resolveStorageValueWithSignedMap(
  value: string | null | undefined,
  signedByPath: Map<string, string>
) {
  if (!value) return null;
  const path = extractStorageObjectPath(value);
  if (!path) return value;
  return signedByPath.get(path) ?? value;
}
