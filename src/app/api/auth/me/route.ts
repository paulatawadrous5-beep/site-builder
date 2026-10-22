import { requireAdmin, unauthorized } from "@/lib/requireAdmin";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  return Response.json({ authed: true });
}
