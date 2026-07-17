// Protezione minima ad accesso condiviso: due password condivise (APP_PASSWORD
// per accesso completo, VIEWER_PASSWORD per accesso limitato a tabella/Gantt)
// con un cookie firmato che porta anche il ruolo (no libreria esterna, no
// tabella sessioni). Sufficiente per un tool interno di team; se in futuro
// serve login per singolo utente si puo' sostituire con SSO Microsoft (Entra
// ID) riusando lo stesso app registration gia' creato per la lettura Excel.
//
// Usa Web Crypto (SubtleCrypto) invece del modulo "crypto" di Node perche'
// questo file viene eseguito anche nel middleware (Edge Runtime).

const COOKIE_NAME = "fp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 giorni

export type Role = "admin" | "viewer";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET non impostato");
  return secret;
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return bufferToHex(signature);
}

export async function createSessionCookieValue(role: Role): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${role}.${expires}`;
  return `${payload}.${await sign(payload)}`;
}

export async function getSession(
  cookieValue: string | undefined
): Promise<{ role: Role } | null> {
  if (!cookieValue) return null;
  const [role, expiresStr, signature] = cookieValue.split(".");
  if (!role || !expiresStr || !signature) return null;
  if (role !== "admin" && role !== "viewer") return null;
  const payload = `${role}.${expiresStr}`;
  if ((await sign(payload)) !== signature) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  return { role };
}

export async function isSessionValid(cookieValue: string | undefined): Promise<boolean> {
  return (await getSession(cookieValue)) !== null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;

// Da usare solo in Server Component/Route Handler (richiede next/headers).
export async function getCurrentRole(): Promise<Role | null> {
  const { cookies } = await import("next/headers");
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  const session = await getSession(cookie);
  return session?.role ?? null;
}
