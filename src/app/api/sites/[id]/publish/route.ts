import { requireAdmin, unauthorized } from "@/lib/requireAdmin";
import { updateSite, StoreError } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!["draft", "published", "archived"].includes(body.status)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }
  try {
    const site = await updateSite(id, { status: body.status });
    if (!site) return Response.json({ error: "Site not found." }, { status: 404 });
    return Response.json(site);
  } catch (err) {
    if (err instanceof StoreError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
