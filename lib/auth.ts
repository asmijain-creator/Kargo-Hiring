// Shared-password login. The cookie holds a hash of APP_PASSWORD, so changing the password
// in Vercel signs everyone out. Uses Web Crypto so it also runs in middleware.

export const AUTH_COOKIE = "kh_auth";

export function authRequired() {
  // Locally, with no password set, the app stays open. On Vercel it always needs one.
  return Boolean(process.env.APP_PASSWORD) || Boolean(process.env.VERCEL);
}

export async function authToken(password: string) {
  const data = new TextEncoder().encode(`kargo-hiring:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isValidToken(token: string | undefined) {
  const password = process.env.APP_PASSWORD;
  if (!password || !token) return false;
  const expected = await authToken(password);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
