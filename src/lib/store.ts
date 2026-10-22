/**
 * THE ONLY persistence module. Every read/write in the app goes through here.
 *
 * Production backend: Vercel Blob (requires BLOB_READ_WRITE_TOKEN).
 *   sites/index.json            -> SiteSummary[]
 *   sites/<id>.json             -> SiteConfig
 *   media/<siteId>/<filename>   -> uploaded files (public URLs)
 *
 * Local development fallback (NO token): a JSON directory on disk
 * (SITE_BUILDER_DATA_DIR, default ./data) with the SAME layout.
 * The local fallback is for development only — never use it in production.
 *
 * The app never seeds sample client sites: a fresh store starts empty.
 */

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { list, put } from "@vercel/blob";
import type { SiteConfig, SiteSummary, SiteStatus } from "./types";
import { newSiteConfig } from "./types";
import { isValidSlug } from "./validate";

export class StoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function localDir(): string {
  return process.env.SITE_BUILDER_DATA_DIR || path.join(process.cwd(), "data");
}

async function localReadJson<T>(rel: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(localDir(), rel), "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return null;
    throw err;
  }
}

async function localWriteJson(rel: string, value: unknown): Promise<void> {
  const full = path.join(localDir(), rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(value, null, 2), "utf-8");
}

async function blobReadJson<T>(rel: string): Promise<T | null> {
  const { blobs } = await list({ prefix: rel, limit: 1 });
  const match = blobs.find((b) => b.pathname === rel);
  if (!match) return null;
  const res = await fetch(match.url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function blobWriteJson(rel: string, value: unknown): Promise<string> {
  const { url } = await put(rel, JSON.stringify(value, null, 2), {
    access: "public",
    contentType: "application/json",
  });
  return url;
}

// Simple in-process mutex so concurrent index updates in one server
// instance serialize (single-admin app; not a distributed lock).
let mutex: Promise<void> = Promise.resolve();
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const prev = mutex;
  mutex = prev.then(() => gate);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function readIndex(): Promise<SiteSummary[]> {
  const idx = useBlob()
    ? await blobReadJson<SiteSummary[]>("sites/index.json")
    : await localReadJson<SiteSummary[]>("sites/index.json");
  return Array.isArray(idx) ? idx : [];
}

async function writeIndex(idx: SiteSummary[]): Promise<void> {
  if (useBlob()) await blobWriteJson("sites/index.json", idx);
  else await localWriteJson("sites/index.json", idx);
}

async function readSiteFile(id: string): Promise<SiteConfig | null> {
  const rel = `sites/${id}.json`;
  const cfg = useBlob()
    ? await blobReadJson<SiteConfig>(rel)
    : await localReadJson<SiteConfig>(rel);
  return cfg && typeof cfg === "object" && cfg.id === id ? cfg : null;
}

async function writeSiteFile(cfg: SiteConfig): Promise<void> {
  const rel = `sites/${cfg.id}.json`;
  if (useBlob()) await blobWriteJson(rel, cfg);
  else await localWriteJson(rel, cfg);
}

function toSummary(cfg: SiteConfig): SiteSummary {
  return { id: cfg.id, name: cfg.name, slug: cfg.slug, status: cfg.status, updatedAt: cfg.updatedAt };
}

export async function listSites(): Promise<SiteSummary[]> {
  const idx = await readIndex();
  return [...idx].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getSite(id: string): Promise<SiteConfig | null> {
  return readSiteFile(id);
}

export async function getSiteBySlug(slug: string): Promise<SiteConfig | null> {
  const idx = await readIndex();
  const hit = idx.find((s) => s.slug === slug);
  if (!hit) return null;
  return readSiteFile(hit.id);
}

export async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const idx = await readIndex();
  return idx.some((s) => s.slug === slug && s.id !== exceptId);
}

export async function createSite(input: { name: string; slug: string }): Promise<SiteConfig> {
  const name = (input.name || "").trim();
  const slug = (input.slug || "").trim().toLowerCase();
  if (!name) throw new StoreError(400, "Site name is required.");
  if (!isValidSlug(slug)) {
    throw new StoreError(400, "Slug must be lowercase letters, numbers, and hyphens only.");
  }
  return withLock(async () => {
    if (await slugTaken(slug)) throw new StoreError(409, "That slug is already taken.");
    const now = new Date().toISOString();
    const cfg = newSiteConfig(randomUUID(), name, slug, now);
    await writeSiteFile(cfg);
    const idx = await readIndex();
    idx.push(toSummary(cfg));
    await writeIndex(idx);
    return cfg;
  });
}

export async function updateSite(
  id: string,
  patch: Partial<Pick<SiteConfig, "name" | "slug" | "status" | "theme" | "sections">>,
): Promise<SiteConfig | null> {
  return withLock(async () => {
    const cfg = await readSiteFile(id);
    if (!cfg) return null;
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new StoreError(400, "Site name is required.");
      cfg.name = name;
    }
    if (patch.slug !== undefined) {
      const slug = patch.slug.trim().toLowerCase();
      if (!isValidSlug(slug)) {
        throw new StoreError(400, "Slug must be lowercase letters, numbers, and hyphens only.");
      }
      if (await slugTaken(slug, id)) throw new StoreError(409, "That slug is already taken.");
      cfg.slug = slug;
    }
    if (patch.status !== undefined) {
      if (!["draft", "published", "archived"].includes(patch.status)) {
        throw new StoreError(400, "Invalid status.");
      }
      cfg.status = patch.status as SiteStatus;
    }
    if (patch.theme !== undefined) cfg.theme = patch.theme;
    if (patch.sections !== undefined) {
      if (!Array.isArray(patch.sections)) throw new StoreError(400, "Sections must be an array.");
      cfg.sections = patch.sections;
    }
    cfg.updatedAt = new Date().toISOString();
    await writeSiteFile(cfg);
    const idx = await readIndex();
    const i = idx.findIndex((s) => s.id === id);
    if (i >= 0) idx[i] = toSummary(cfg);
    else idx.push(toSummary(cfg));
    await writeIndex(idx);
    return cfg;
  });
}

export async function deleteSite(id: string): Promise<boolean> {
  return withLock(async () => {
    const cfg = await readSiteFile(id);
    if (!cfg) return false;
    if (useBlob()) {
      // Vercel Blob has no delete-by-pathname helper in this SDK version
      // for arbitrary paths without a URL; overwrite with a tombstone-free
      // approach: delete via the blob URL if discoverable.
      const { blobs } = await list({ prefix: `sites/${id}.json`, limit: 1 });
      const match = blobs.find((b) => b.pathname === `sites/${id}.json`);
      if (match) {
        const { del } = await import("@vercel/blob");
        await del(match.url);
      }
    } else {
      await fs.rm(path.join(localDir(), `sites/${id}.json`), { force: true });
    }
    const idx = (await readIndex()).filter((s) => s.id !== id);
    await writeIndex(idx);
    return true;
  });
}

export async function duplicateSite(id: string): Promise<SiteConfig | null> {
  return withLock(async () => {
    const src = await readSiteFile(id);
    if (!src) return null;
    const now = new Date().toISOString();
    let base = `${src.slug}-copy`;
    let slug = base;
    let n = 2;
    while (await slugTaken(slug)) {
      slug = `${base}-${n++}`;
    }
    const cfg: SiteConfig = {
      ...JSON.parse(JSON.stringify(src)) as SiteConfig,
      id: randomUUID(),
      name: `${src.name} (copy)`,
      slug,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    // Regenerate every section/row/icon id so the copy is fully independent.
    cfg.sections = cfg.sections.map((s) => {
      const copy = { ...s, id: randomUUID() } as typeof s;
      if (copy.type === "carousel") {
        copy.images = copy.images.map((im) => ({ ...im, id: randomUUID() }));
      }
      if (copy.type === "iconRows") {
        copy.rows = copy.rows.map((row) => ({
          ...row,
          id: randomUUID(),
          icons: row.icons.map((ic) => ({ ...ic, id: randomUUID() })),
        }));
      }
      if (copy.type === "contact") {
        copy.actions = copy.actions.map((a) => ({ ...a, id: randomUUID() }));
      }
      return copy;
    });
    await writeSiteFile(cfg);
    const idx = await readIndex();
    idx.push(toSummary(cfg));
    await writeIndex(idx);
    return cfg;
  });
}

/**
 * Store an uploaded file. Returns its public URL.
 * Filenames are made unique per site so replacing a file never collides
 * with an old one and old URLs keep working until explicitly removed.
 */
export async function storeMedia(
  siteId: string,
  originalName: string,
  contentType: string,
  data: Buffer,
): Promise<string> {
  const stamp = Date.now().toString(36);
  const rand = randomUUID().slice(0, 8);
  const safe = originalName.replace(/[^A-Za-z0-9._-]+/g, "_");
  const filename = `${stamp}-${rand}-${safe}`;
  const rel = `media/${siteId}/${filename}`;
  if (useBlob()) {
    const { url } = await put(rel, data, { access: "public", contentType });
    return url;
  }
  const full = path.join(localDir(), rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  // In local dev the file is served by /api/media/[...path].
  return `/api/media/${siteId}/${filename}`;
}

/** Is this deployment using the local (non-Blob) fallback? */
export function isLocalBackend(): boolean {
  return !useBlob();
}
