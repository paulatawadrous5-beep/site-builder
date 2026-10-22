import { requireAdmin, unauthorized } from "@/lib/requireAdmin";
import { listSites, createSite, StoreError } from "@/lib/store";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  return Response.json(await listSites());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  try {
    const site = await createSite({
      name: typeof body.name === "string" ? body.name : "",
      slug: typeof body.slug === "string" ? body.slug : "",
    });
    return Response.json(site, { status: 201 });
  } catch (err) {
    if (err instanceof StoreError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
