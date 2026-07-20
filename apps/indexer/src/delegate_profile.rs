use sqlx::{Postgres, Transaction};

pub(crate) const ZERO_DELEGATE_ADDRESS: &str = "0x0000000000000000000000000000000000000000";

pub fn delegate_profile_scope_lock_key(
    chain_id: i32,
    dao_code: &str,
    governor_address: &str,
) -> String {
    format!(
        "degov_delegate_profile:{}:{}:{}",
        chain_id,
        dao_code,
        governor_address.to_lowercase()
    )
}

pub(crate) async fn acquire_delegate_profile_scope_lock(
    transaction: &mut Transaction<'_, Postgres>,
    chain_id: i32,
    dao_code: &str,
    governor_address: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(delegate_profile_scope_lock_key(
            chain_id,
            dao_code,
            governor_address,
        ))
        .execute(&mut **transaction)
        .await?;
    Ok(())
}
