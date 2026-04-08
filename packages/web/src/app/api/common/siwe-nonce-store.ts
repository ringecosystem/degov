import { databaseConnection } from "./database";
import { SIWE_NONCE_COOKIE_MAX_AGE_SECONDS } from "./siwe-nonce";

const SIWE_NONCE_TTL_MILLISECONDS = SIWE_NONCE_COOKIE_MAX_AGE_SECONDS * 1000;

export async function storeSiweNonce(nonce: string): Promise<void> {
  const sql = databaseConnection();
  const expiresAt = new Date(Date.now() + SIWE_NONCE_TTL_MILLISECONDS);

  await sql`
    insert into d_siwe_nonce (nonce, expires_at)
    values (${nonce}, ${expiresAt.toISOString()})
    on conflict (nonce) do update
    set expires_at = excluded.expires_at
  `;

  await sql`
    delete from d_siwe_nonce
    where expires_at <= now()
  `;
}

export async function consumeSiweNonce(nonce: string): Promise<boolean> {
  const sql = databaseConnection();
  const [storedNonce] = await sql`
    delete from d_siwe_nonce
    where nonce = ${nonce}
      and expires_at > now()
    returning nonce
  `;

  return !!storedNonce;
}
