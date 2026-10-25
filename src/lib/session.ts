// Signed login cookie, verified with Web Crypto so it works in middleware (edge) and in server code.

export const SESSION_COOKIE = "fb_session";
export const SESSION_DAYS = 90;

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await hmac(secret, String(expires))}`;
}

export async function verifySessionToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!secret || !token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return sig === (await hmac(secret, expires));
}
