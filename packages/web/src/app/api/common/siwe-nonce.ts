import { jwtVerify, SignJWT } from "jose";

export const SIWE_NONCE_COOKIE_NAME = "degov_siwe_nonce";
export const SIWE_NONCE_COOKIE_MAX_AGE_SECONDS = 180;

const textEncoder = new TextEncoder();

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
