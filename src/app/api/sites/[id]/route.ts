import { requireAdmin, unauthorized } from "@/lib/requireAdmin";
import { getSite, updateSite, deleteSite, StoreError } from "@/lib/store";
import type { Section, SiteStatus, Theme } from "@/lib/types";

const SECTION_TYPES = new Set(["header", "carousel", "video", "iconRows", "contact"]);

function validSections(value: unknown): value is Section[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (s) =>
      s && typeof s === "object" && typeof s.id === "string" && SECTION_TYPES.has(s.type) && typeof s.enabled === "boolean",
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  const site = await getSite(id);
  if (!site) return Response.json({ error: "Site not found." }, { status: 404 });
  return Response.json(site);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: {
    name?: string;
    slug?: string;
    status?: SiteStatus;
    theme?: Theme;
    sections?: Section[];
  } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") return Response.json({ error: "Invalid name." }, { status: 400 });
    patch.name = body.name;
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string") return Response.json({ error: "Invalid slug." }, { status: 400 });
    patch.slug = body.slug;
  }
  if (body.status !== undefined) {
    if (!["draft", "published", "archived"].includes(body.status)) {
      return Response.json({ error: "Invalid status." }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.theme !== undefined) {
    if (typeof body.theme !== "object" || body.theme === null) {
      return Response.json({ error: "Invalid theme." }, { status: 400 });
    }
    patch.theme = body.theme;
  }
  if (body.sections !== undefined) {
    if (!validSections(body.sections)) {
      return Response.json({ error: "Invalid sections: unknown section type or missing id." }, { status: 400 });
    }
    patch.sections = body.sections;
  }
  try {
    const site = await updateSite(id, patch);
    if (!site) return Response.json({ error: "Site not found." }, { status: 404 });
    return Response.json(site);
  } catch (err) {
    if (err instanceof StoreError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  const ok = await deleteSite(id);
  if (!ok) return Response.json({ error: "Site not found." }, { status: 404 });
  return Response.json({ ok: true });
}
