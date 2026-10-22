import { requireAdmin, unauthorized } from "@/lib/requireAdmin";
import { getSite, storeMedia } from "@/lib/store";
import { safeFileName, validateUpload, type UploadKind } from "@/lib/validate";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  const siteId = form.get("siteId");
  const kind = form.get("kind") as UploadKind | null;
  const file = form.get("file");
  if (typeof siteId !== "string" || !siteId) {
    return Response.json({ error: "siteId is required." }, { status: 400 });
  }
  if (kind !== "image" && kind !== "video") {
    return Response.json({ error: "kind must be 'image' or 'video'." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  const site = await getSite(siteId);
  if (!site) return Response.json({ error: "Site not found." }, { status: 404 });
  const problem = validateUpload(kind, file.type, file.size);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const url = await storeMedia(siteId, safeFileName(file.name), file.type, buf);
  return Response.json({ url });
}
