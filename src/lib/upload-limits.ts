export const BYTES_PER_MB = 1024 * 1024;

export const IMAGE_MAX_BYTES = 12 * BYTES_PER_MB;
export const VIDEO_MAX_BYTES = 150 * BYTES_PER_MB;
export const PDF_MAX_BYTES = 25 * BYTES_PER_MB;

export const MEDIA_FILE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.mp4,.webm,image/jpeg,image/png,image/webp,video/mp4,video/webm";
export const ATTACHMENT_FILE_ACCEPT = ".pdf,application/pdf";
export const COVER_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export type UploadContext = "cover" | "media" | "attachment";
export type UploadKind = "image" | "video" | "pdf";

type UploadCandidate = {
  name: string;
  size: number;
  type?: string | null;
};

type UploadValidationOk = {
  ok: true;
  kind: UploadKind;
};

type UploadValidationError = {
  ok: false;
  error: string;
};

export type UploadValidationResult = UploadValidationOk | UploadValidationError;

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);
const PDF_MIME_TYPES = new Set(["application/pdf"]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

function toMbLabel(bytes: number) {
  return `${Math.round((bytes / BYTES_PER_MB) * 10) / 10} MB`;
}

function getFileExtension(fileName: string) {
  const cleanName = fileName.trim().toLowerCase();
  const index = cleanName.lastIndexOf(".");
  if (index === -1) return "";
  return cleanName.slice(index + 1);
}

function detectUploadKind(file: UploadCandidate): UploadKind | null {
  const mime = (file.type ?? "").toLowerCase();
  const extension = getFileExtension(file.name);

  if (IMAGE_MIME_TYPES.has(mime) || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_MIME_TYPES.has(mime) || VIDEO_EXTENSIONS.has(extension)) return "video";
  if (PDF_MIME_TYPES.has(mime) || PDF_EXTENSIONS.has(extension)) return "pdf";
  return null;
}

export function validateUploadCandidate(file: UploadCandidate, context: UploadContext): UploadValidationResult {
  if (!file.name || file.size <= 0) {
    return { ok: false, error: "File vuoto o non valido." };
  }

  const kind = detectUploadKind(file);
  if (!kind) {
    if (context === "attachment") {
      return { ok: false, error: "Formato non supportato. Sono consentiti solo PDF." };
    }
    if (context === "cover") {
      return { ok: false, error: "Formato non supportato. Usa JPG, PNG o WEBP." };
    }
    return { ok: false, error: "Formato non supportato. Usa JPG, PNG, WEBP, MP4 o WEBM." };
  }

  if (context === "cover" && kind !== "image") {
    return { ok: false, error: "La copertina deve essere un'immagine (JPG, PNG o WEBP)." };
  }
  if (context === "media" && kind !== "image" && kind !== "video") {
    return { ok: false, error: "Per i media sono consentiti solo immagini o video." };
  }
  if (context === "attachment" && kind !== "pdf") {
    return { ok: false, error: "Per gli allegati sono consentiti solo file PDF." };
  }

  const maxBytes = kind === "image" ? IMAGE_MAX_BYTES : kind === "video" ? VIDEO_MAX_BYTES : PDF_MAX_BYTES;
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `File troppo grande. Limite ${toMbLabel(maxBytes)} per ${kind === "image" ? "immagini" : kind === "video" ? "video" : "PDF"}.`
    };
  }

  return { ok: true, kind };
}
