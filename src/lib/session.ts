// Protezione minima ad accesso condiviso: un'unica password (APP_PASSWORD)
// per tutta l'app, con un cookie firmato (no libreria esterna, no tabella
// sessioni). Sufficiente per un tool interno di team; se in futuro serve
// login per singolo utente si puo' sostituire con SSO Microsoft (Entra ID)
// riusando lo stesso app registration gia' creato per la lettura Excel.
//
// Usa Web Crypto (SubtleCrypto) invece del modulo "crypto" di Node perche'
// questo file viene eseguito anche nel middleware (Edge Runtime).

const COOKIE_NAME = "fp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 giorni

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

export async function createSessionCookieValue(): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${expires}`;
  return `${payload}.${await sign(payload)}`;
}

export async function isSessionValid(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature) return false;
  if ((await sign(payload)) !== signature) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
