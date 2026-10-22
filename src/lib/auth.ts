/**
 * Single-admin session auth.
 *
 * Implemented ONLY with the Web Crypto API (crypto.subtle) so it runs in
 * BOTH the Node.js runtime (API routes) and the Edge runtime (middleware).
 * Node's `crypto` module is NOT available in the Edge runtime.
 *
 * Session cookie value: base64url(JSON payload) + "." + HMAC-SHA256 hex.
 * Payload: { admin: true, exp: <unix seconds> }.
 * Passwords are never stored: only ADMIN_PASSWORD_HASH (SHA-256 hex) is
 * compared, in constant time. In development only, when no hash is
 * configured, the password "admin123" is accepted and a loud warning is
 * printed. In production without a hash, login always fails (fail closed).
 */

export const SESSION_COOKIE = "sb_admin";
const SESSION_DAYS = 7;

const enc = new TextEncoder();

function getSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") return null;
  console.warn(
    "[site-builder] WARNING: SESSION_SECRET is missing or too short — using a dev-only default. Set SESSION_SECRET before deploying.",
  );
  return "dev-only-session-secret-change-me";
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return toHex(digest);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toHex(sig);
}

/** Constant-time string comparison (length must match, then XOR accumulate). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  return sha256Hex(password);
}

export async function checkPassword(submitted: string): Promise<boolean> {
  const configured = process.env.ADMIN_PASSWORD_HASH;
  if (configured) {
    return safeEqual(await sha256Hex(submitted), configured.trim().toLowerCase());
  }
  if (process.env.NODE_ENV === "production") return false;
  console.warn(
    "[site-builder] WARNING: ADMIN_PASSWORD_HASH is not set — accepting the development password 'admin123'. Set ADMIN_PASSWORD_HASH before deploying.",
  );
  return submitted === "admin123";
}

export async function createSessionToken(): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const payload = JSON.stringify({ admin: true, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 });
  const body = Buffer.from(payload, "utf-8").toString("base64url");
  const sig = await hmacHex(secret, body);
  return `${body}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const secret = getSecret();
  if (!secret) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = await hmacHex(secret, body);
  if (!safeEqual(sig, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as {
      admin?: boolean;
      exp?: number;
    };
    return payload.admin === true && typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
