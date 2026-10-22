import { promises as fs } from "fs";
import path from "path";
import { isLocalBackend } from "@/lib/store";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/**
 * Serves locally stored media in development (local backend only).
 * In production, media lives on Vercel Blob and is served from blob URLs
 * directly, so this route 404s.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (isLocalBackend() === false) {
    return new Response("Not found", { status: 404 });
  }
  const { path: parts } = await params;
  const rel = parts.join("/");
  if (rel.includes("..") || rel.startsWith("/")) {
    return new Response("Bad request", { status: 400 });
  }
  const base = process.env.SITE_BUILDER_DATA_DIR || path.join(process.cwd(), "data");
  const full = path.join(base, "media", rel);
  try {
    const buf = await fs.readFile(full);
    const ext = path.extname(full).toLowerCase();
    return new Response(buf as unknown as BodyInit, {
      headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=31536000" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
