import { databaseConnection } from "./database";
import { siweNonceExpiresAt } from "./siwe-nonce";

export async function storeSiweNonce(nonce: string): Promise<void> {
  const sql = databaseConnection();
  const expiresAt = siweNonceExpiresAt();

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
  const now = new Date();
  const [storedNonce] = await sql`
    delete from d_siwe_nonce
    where nonce = ${nonce}
      and expires_at > ${now.toISOString()}
    returning nonce
  `;

  return !!storedNonce;
}
