/** Server-side validation helpers. Never trust client-provided values. */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return typeof slug === "string" && slug.length >= 1 && slug.length <= 100 && SLUG_RE.test(slug);
}

/** Only http(s) URLs are allowed as external link destinations. */
export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Strip everything but digits (for WhatsApp wa.me links). */
export function digitsOnly(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

/** Convert a YouTube watch/shorts URL to an embed URL; returns null if not YouTube. */
export function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] || null;
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || null;
    } else if (host === "youtu.be") {
      id = u.pathname.slice(1).split("/")[0] || null;
    }
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}`;
  } catch {
    return null;
  }
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export type UploadKind = "image" | "video";

export function validateUpload(
  kind: UploadKind,
  contentType: string,
  sizeBytes: number,
): string | null {
  if (kind === "image") {
    if (!IMAGE_TYPES.has(contentType.toLowerCase())) return "Only PNG and JPG/JPEG images are allowed.";
    if (sizeBytes > 10 * 1024 * 1024) return "Image must be 10MB or smaller.";
  } else {
    if (!VIDEO_TYPES.has(contentType.toLowerCase())) return "Only MP4, WebM, or MOV videos are allowed.";
    if (sizeBytes > 100 * 1024 * 1024) return "Video must be 100MB or smaller.";
  }
  return null;
}

/** Sanitize a filename for storage: keep basename, replace unsafe chars. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return cleaned || "upload";
}
