import { jwtVerify, SignJWT } from "jose";

export const SIWE_NONCE_COOKIE_NAME = "degov_siwe_nonce";
export const SIWE_NONCE_COOKIE_MAX_AGE_SECONDS = 180;

const SIWE_NONCE_TTL_MILLISECONDS = SIWE_NONCE_COOKIE_MAX_AGE_SECONDS * 1000;
const textEncoder = new TextEncoder();

export function siweNonceExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SIWE_NONCE_TTL_MILLISECONDS);
}

export function siweNonceIsUsable(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() > now.getTime();
}

export async function signSiweNonceCookieValue(
  nonce: string,
  jwtSecretKey: string
): Promise<string> {
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("siwe-nonce")
    .setIssuedAt()
    .setExpirationTime(`${SIWE_NONCE_COOKIE_MAX_AGE_SECONDS}s`)
    .sign(textEncoder.encode(jwtSecretKey));
}

export async function verifySiweNonceCookieValue(
  cookieValue: string,
  jwtSecretKey: string
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify<{ nonce?: string }>(
      cookieValue,
      textEncoder.encode(jwtSecretKey),
      {
        subject: "siwe-nonce",
      }
    );

    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}
