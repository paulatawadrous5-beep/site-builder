import { checkPassword, createSessionToken, sessionCookieHeader } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await checkPassword(password))) {
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }
  const token = await createSessionToken();
  if (!token) {
    return Response.json(
      { error: "Server is missing SESSION_SECRET. Set it and try again." },
      { status: 500 },
    );
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(token),
    },
  });
}
