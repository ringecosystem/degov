use sqlx::{PgPool, postgres::PgPoolOptions};
use thiserror::Error;

use super::migrate::apply_migrations;

const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";

#[derive(Debug, Error)]
pub enum DelegateProfileBackfillError {
    #[error("delegate profile backfill dao_code must not be empty")]
    EmptyDaoCode,

    #[error("delegate profile backfill governor_address must not be empty")]
    EmptyGovernorAddress,

    #[error("delegate profile backfill max_scopes must be greater than zero")]
    InvalidMaxScopes,

    #[error("missing required Datalens configuration field DEGOV_INDEXER_DATABASE_URL")]
    MissingDatabaseUrl,

    #[error("connect to DeGov indexer Postgres: {0}")]
    Connect(#[source] sqlx::Error),

    #[error("apply DeGov indexer migrations: {0}")]
    Migration(String),

    #[error("{operation}: {source}")]
    Database {
        operation: &'static str,
        #[source]
        source: sqlx::Error,
    },

    #[error(
        "delegate profile verification failed for {scope}: registry_count={registry_count} historical_count={historical_count}"
    )]
    Verification {
        scope: String,
        registry_count: i64,
        historical_count: i64,
    },

    #[error("delegate profile count exceeds data_metric INTEGER range")]
    MetricCountOutOfRange,

    #[error("delegate profile backfill row count exceeds usize")]
    RowCountOutOfRange,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateProfileScope {
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
}

impl DelegateProfileScope {
    pub fn new(
        chain_id: i32,
        dao_code: impl Into<String>,
        governor_address: impl Into<String>,
    ) -> Result<Self, DelegateProfileBackfillError> {
        let dao_code = dao_code.into();
        let governor_address = governor_address.into().to_lowercase();
        if dao_code.is_empty() {
            return Err(DelegateProfileBackfillError::EmptyDaoCode);
        }
        if governor_address.is_empty() {
            return Err(DelegateProfileBackfillError::EmptyGovernorAddress);
        }

        Ok(Self {
            chain_id,
            dao_code,
            governor_address,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DelegateProfileBackfillSelection {
    Scope(DelegateProfileScope),
    AllScopes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateProfileBackfillOptions {
    pub selection: DelegateProfileBackfillSelection,
    pub dry_run: bool,
    pub max_scopes: Option<usize>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DelegateProfileBackfillReport {
    pub scopes_processed: usize,
    pub profiles_inserted: usize,
    pub metric_rows_updated: usize,
    pub dry_run: bool,
}

pub async fn repair_delegate_profiles(
    options: DelegateProfileBackfillOptions,
) -> Result<DelegateProfileBackfillReport, DelegateProfileBackfillError> {
    let database_url = std::env::var("DEGOV_INDEXER_DATABASE_URL")
        .map_err(|_| DelegateProfileBackfillError::MissingDatabaseUrl)?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .map_err(DelegateProfileBackfillError::Connect)?;
    apply_migrations(&pool)
        .await
        .map_err(|error| DelegateProfileBackfillError::Migration(error.to_string()))?;

    repair_delegate_profiles_with_pool(&pool, options).await
}

pub async fn repair_delegate_profiles_with_pool(
    pool: &PgPool,
    options: DelegateProfileBackfillOptions,
) -> Result<DelegateProfileBackfillReport, DelegateProfileBackfillError> {
    if options.max_scopes == Some(0) {
        return Err(DelegateProfileBackfillError::InvalidMaxScopes);
    }

    let scopes = resolve_scopes(pool, &options).await?;
    let mut report = DelegateProfileBackfillReport {
        dry_run: options.dry_run,
        ..DelegateProfileBackfillReport::default()
    };

    for scope in scopes {
        let mut transaction = pool.begin().await.map_err(|source| {
            database_error("begin delegate profile backfill scope transaction", source)
        })?;
        let lock_key = format!(
            "degov_delegate_profile:{}:{}:{}",
            scope.chain_id, scope.dao_code, scope.governor_address
        );
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(lock_key)
            .execute(&mut *transaction)
            .await
            .map_err(|source| {
                database_error("acquire delegate profile backfill scope lock", source)
            })?;

        let insert_result = sqlx::query(
            "INSERT INTO delegate_profile (chain_id, dao_code, governor_address, delegate)
             SELECT $1, $2, $3, lower(delegate.to_delegate)
             FROM delegate
             WHERE delegate.chain_id = $1
               AND delegate.dao_code = $2
               AND lower(delegate.governor_address) = $3
               AND lower(delegate.to_delegate) <> $4
             GROUP BY lower(delegate.to_delegate)
             ON CONFLICT DO NOTHING",
        )
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .bind(ZERO_ADDRESS)
        .execute(&mut *transaction)
        .await
        .map_err(|source| database_error("insert delegate profiles", source))?;

        let registry_count: i64 = sqlx::query_scalar(
            "SELECT count(*)
             FROM delegate_profile
             WHERE chain_id = $1 AND dao_code = $2 AND governor_address = $3",
        )
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|source| database_error("count delegate profiles", source))?;
        let historical_count: i64 = sqlx::query_scalar(
            "SELECT count(DISTINCT lower(delegate.to_delegate))
             FROM delegate
             WHERE delegate.chain_id = $1
               AND delegate.dao_code = $2
               AND lower(delegate.governor_address) = $3
               AND lower(delegate.to_delegate) <> $4",
        )
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .bind(ZERO_ADDRESS)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|source| database_error("verify delegate profile history", source))?;
        if registry_count != historical_count {
            return Err(DelegateProfileBackfillError::Verification {
                scope: scope_label(&scope),
                registry_count,
                historical_count,
            });
        }
        let registry_count = i32::try_from(registry_count)
            .map_err(|_| DelegateProfileBackfillError::MetricCountOutOfRange)?;

        let update_result = sqlx::query(
            "UPDATE data_metric
             SET delegate_profiles_count = $4
             WHERE id = 'global'
               AND chain_id = $1
               AND dao_code = $2
               AND lower(governor_address) = $3",
        )
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .bind(registry_count)
        .execute(&mut *transaction)
        .await
        .map_err(|source| database_error("update delegate profile metric", source))?;

        report.scopes_processed += 1;
        report.profiles_inserted += rows_affected(insert_result.rows_affected())?;
        report.metric_rows_updated += rows_affected(update_result.rows_affected())?;

        if options.dry_run {
            transaction.rollback().await.map_err(|source| {
                database_error(
                    "roll back delegate profile dry run scope transaction",
                    source,
                )
            })?;
        } else {
            transaction.commit().await.map_err(|source| {
                database_error("commit delegate profile backfill scope transaction", source)
            })?;
        }
    }

    Ok(report)
}

async fn resolve_scopes(
    pool: &PgPool,
    options: &DelegateProfileBackfillOptions,
) -> Result<Vec<DelegateProfileScope>, DelegateProfileBackfillError> {
    let mut scopes = match &options.selection {
        DelegateProfileBackfillSelection::Scope(scope) => vec![scope.clone()],
        DelegateProfileBackfillSelection::AllScopes => {
            let rows: Vec<(i32, String, String)> = sqlx::query_as(
                "SELECT chain_id, dao_code, governor_address
                 FROM (
                   SELECT chain_id, dao_code, lower(governor_address) AS governor_address
                   FROM data_metric
                   WHERE id = 'global'
                     AND chain_id IS NOT NULL
                     AND dao_code IS NOT NULL
                     AND governor_address IS NOT NULL
                   UNION
                   SELECT chain_id, dao_code, lower(governor_address) AS governor_address
                   FROM delegate
                   WHERE chain_id IS NOT NULL
                     AND dao_code IS NOT NULL
                     AND governor_address IS NOT NULL
                 ) logical_scope
                 ORDER BY chain_id, dao_code, governor_address",
            )
            .fetch_all(pool)
            .await
            .map_err(|source| {
                database_error("discover delegate profile backfill scopes", source)
            })?;
            rows.into_iter()
                .map(|(chain_id, dao_code, governor_address)| {
                    DelegateProfileScope::new(chain_id, dao_code, governor_address)
                })
                .collect::<Result<Vec<_>, _>>()?
        }
    };

    if let Some(max_scopes) = options.max_scopes {
        scopes.truncate(max_scopes);
    }

    Ok(scopes)
}

fn scope_label(scope: &DelegateProfileScope) -> String {
    format!(
        "chain_id={} dao_code={} governor_address={}",
        scope.chain_id, scope.dao_code, scope.governor_address
    )
}

fn rows_affected(value: u64) -> Result<usize, DelegateProfileBackfillError> {
    usize::try_from(value).map_err(|_| DelegateProfileBackfillError::RowCountOutOfRange)
}

fn database_error(operation: &'static str, source: sqlx::Error) -> DelegateProfileBackfillError {
    DelegateProfileBackfillError::Database { operation, source }
}
