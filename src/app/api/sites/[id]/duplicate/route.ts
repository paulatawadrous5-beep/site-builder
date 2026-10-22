import { requireAdmin, unauthorized } from "@/lib/requireAdmin";
import { duplicateSite } from "@/lib/store";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  const site = await duplicateSite(id);
  if (!site) return Response.json({ error: "Site not found." }, { status: 404 });
  return Response.json(site, { status: 201 });
}
