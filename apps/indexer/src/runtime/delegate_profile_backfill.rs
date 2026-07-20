use sqlx::{PgPool, postgres::PgPoolOptions};
use thiserror::Error;

use crate::delegate_profile::acquire_delegate_profile_scope_lock;

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

    #[error("delegate profile backfill preflight failed: {0}")]
    Preflight(String),

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

    #[error(
        "delegate profile metric verification failed for {scope}: expected_count={expected_count} intended_replicas={intended_replicas} actual_replicas={actual_replicas} populated_replicas={populated_replicas} min_count={min_count:?} max_count={max_count:?}"
    )]
    MetricVerification {
        scope: String,
        expected_count: i32,
        intended_replicas: u64,
        actual_replicas: i64,
        populated_replicas: i64,
        min_count: Option<i32>,
        max_count: Option<i32>,
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

fn validate_options(
    options: &DelegateProfileBackfillOptions,
) -> Result<(), DelegateProfileBackfillError> {
    if options.max_scopes == Some(0) {
        return Err(DelegateProfileBackfillError::InvalidMaxScopes);
    }
    Ok(())
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DelegateProfileBackfillReport {
    pub scopes_processed: usize,
    pub profiles_inserted: usize,
    pub metric_rows_updated: usize,
    pub profiles_would_insert: usize,
    pub metric_rows_would_update: usize,
    pub dry_run: bool,
}

pub async fn repair_delegate_profiles(
    options: DelegateProfileBackfillOptions,
) -> Result<DelegateProfileBackfillReport, DelegateProfileBackfillError> {
    validate_options(&options)?;
    let database_url = std::env::var("DEGOV_INDEXER_DATABASE_URL")
        .map_err(|_| DelegateProfileBackfillError::MissingDatabaseUrl)?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .map_err(DelegateProfileBackfillError::Connect)?;

    repair_delegate_profiles_with_pool(&pool, options).await
}

pub async fn repair_delegate_profiles_with_pool(
    pool: &PgPool,
    options: DelegateProfileBackfillOptions,
) -> Result<DelegateProfileBackfillReport, DelegateProfileBackfillError> {
    validate_options(&options)?;
    preflight_delegate_profile_backfill(pool).await?;

    let scopes = resolve_scopes(pool, &options).await?;
    let mut report = DelegateProfileBackfillReport {
        dry_run: options.dry_run,
        ..DelegateProfileBackfillReport::default()
    };

    for scope in scopes {
        let mut transaction = pool.begin().await.map_err(|source| {
            database_error("begin delegate profile backfill scope transaction", source)
        })?;
        acquire_delegate_profile_scope_lock(
            &mut transaction,
            scope.chain_id,
            &scope.dao_code,
            &scope.governor_address,
        )
        .await
        .map_err(|source| database_error("acquire delegate profile backfill scope lock", source))?;

        let existing_registry_count: i64 = sqlx::query_scalar(
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
        let profiles_would_insert: i64 = sqlx::query_scalar(
            "SELECT count(DISTINCT lower(delegate.to_delegate))
             FROM delegate
             WHERE delegate.chain_id = $1
               AND delegate.dao_code = $2
               AND lower(delegate.governor_address) = $3
               AND lower(delegate.to_delegate) <> '0x0000000000000000000000000000000000000000'
               AND NOT EXISTS (
                 SELECT 1
                 FROM delegate_profile
                 WHERE delegate_profile.chain_id = $1
                   AND delegate_profile.dao_code = $2
                   AND delegate_profile.governor_address = $3
                   AND delegate_profile.delegate = lower(delegate.to_delegate)
               )",
        )
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|source| database_error("count missing delegate profiles", source))?;
        let historical_count: i64 = sqlx::query_scalar(
            "SELECT count(DISTINCT lower(delegate.to_delegate))
             FROM delegate
             WHERE delegate.chain_id = $1
               AND delegate.dao_code = $2
               AND lower(delegate.governor_address) = $3
               AND lower(delegate.to_delegate) <> '0x0000000000000000000000000000000000000000'",
        )
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|source| database_error("verify delegate profile history", source))?;
        let expected_registry_count = existing_registry_count + profiles_would_insert;
        if expected_registry_count != historical_count {
            return Err(DelegateProfileBackfillError::Verification {
                scope: scope_label(&scope),
                registry_count: expected_registry_count,
                historical_count,
            });
        }
        let _planned_registry_count = i32::try_from(expected_registry_count)
            .map_err(|_| DelegateProfileBackfillError::MetricCountOutOfRange)?;
        let metric_rows_would_update: i64 = sqlx::query_scalar(
            "SELECT count(*)
             FROM data_metric
             WHERE id = 'global'
               AND chain_id = $1
               AND dao_code = $2
               AND lower(governor_address) = $3",
        )
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|source| database_error("count delegate profile metric rows", source))?;

        report.scopes_processed += 1;
        report.profiles_would_insert += i64_rows(profiles_would_insert)?;
        report.metric_rows_would_update += i64_rows(metric_rows_would_update)?;

        if options.dry_run {
            transaction.rollback().await.map_err(|source| {
                database_error(
                    "roll back delegate profile dry run scope transaction",
                    source,
                )
            })?;
        } else {
            let insert_result = sqlx::query(
                "INSERT INTO delegate_profile (chain_id, dao_code, governor_address, delegate)
                 SELECT $1, $2, $3, lower(delegate.to_delegate)
                 FROM delegate
                 WHERE delegate.chain_id = $1
                   AND delegate.dao_code = $2
                   AND lower(delegate.governor_address) = $3
                   AND lower(delegate.to_delegate) <> '0x0000000000000000000000000000000000000000'
                 GROUP BY lower(delegate.to_delegate)
                 ON CONFLICT DO NOTHING",
            )
            .bind(scope.chain_id)
            .bind(&scope.dao_code)
            .bind(&scope.governor_address)
            .execute(&mut *transaction)
            .await
            .map_err(|source| database_error("insert delegate profiles", source))?;
            let actual_registry_count: i64 = sqlx::query_scalar(
                "SELECT count(*)
                 FROM delegate_profile
                 WHERE chain_id = $1 AND dao_code = $2 AND governor_address = $3",
            )
            .bind(scope.chain_id)
            .bind(&scope.dao_code)
            .bind(&scope.governor_address)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|source| database_error("verify inserted delegate profiles", source))?;
            let actual_historical_count: i64 = sqlx::query_scalar(
                "SELECT count(DISTINCT lower(delegate.to_delegate))
                 FROM delegate
                 WHERE delegate.chain_id = $1
                   AND delegate.dao_code = $2
                   AND lower(delegate.governor_address) = $3
                   AND lower(delegate.to_delegate) <> '0x0000000000000000000000000000000000000000'",
            )
            .bind(scope.chain_id)
            .bind(&scope.dao_code)
            .bind(&scope.governor_address)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|source| database_error("verify inserted delegate profile history", source))?;
            if actual_registry_count != actual_historical_count {
                return Err(DelegateProfileBackfillError::Verification {
                    scope: scope_label(&scope),
                    registry_count: actual_registry_count,
                    historical_count: actual_historical_count,
                });
            }
            let verified_registry_count = i32::try_from(actual_registry_count)
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
            .bind(verified_registry_count)
            .execute(&mut *transaction)
            .await
            .map_err(|source| database_error("update delegate profile metric", source))?;
            let (actual_replicas, populated_replicas, min_count, max_count): (
                i64,
                i64,
                Option<i32>,
                Option<i32>,
            ) = sqlx::query_as(
                "SELECT
                   count(*),
                   count(delegate_profiles_count),
                   min(delegate_profiles_count),
                   max(delegate_profiles_count)
                 FROM data_metric
                 WHERE id = 'global'
                   AND chain_id = $1
                   AND dao_code = $2
                   AND lower(governor_address) = $3",
            )
            .bind(scope.chain_id)
            .bind(&scope.dao_code)
            .bind(&scope.governor_address)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|source| database_error("verify delegate profile metric replicas", source))?;
            let intended_replicas = update_result.rows_affected();
            let replicas_match = u64::try_from(actual_replicas) == Ok(intended_replicas)
                && populated_replicas == actual_replicas
                && min_count == Some(verified_registry_count)
                && max_count == Some(verified_registry_count);
            if !replicas_match {
                return Err(DelegateProfileBackfillError::MetricVerification {
                    scope: scope_label(&scope),
                    expected_count: verified_registry_count,
                    intended_replicas,
                    actual_replicas,
                    populated_replicas,
                    min_count,
                    max_count,
                });
            }
            report.profiles_inserted += rows_affected(insert_result.rows_affected())?;
            report.metric_rows_updated += rows_affected(intended_replicas)?;
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
    let scopes = match &options.selection {
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
                 ORDER BY chain_id, dao_code, governor_address
                 LIMIT $1",
            )
            .bind(i64::try_from(options.max_scopes.unwrap_or(usize::MAX)).unwrap_or(i64::MAX))
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

    Ok(scopes)
}

async fn preflight_delegate_profile_backfill(
    pool: &PgPool,
) -> Result<(), DelegateProfileBackfillError> {
    let catalog_ready: bool = sqlx::query_scalar(
        "SELECT
           to_regclass('delegate_profile') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = 'data_metric'
               AND column_name = 'delegate_profiles_count'
           )
           AND (
             SELECT count(*) = 4
             FROM pg_constraint
             WHERE conrelid = to_regclass('delegate_profile')
               AND conname IN (
                 'delegate_profile_pkey',
                 'delegate_profile_governor_address_normalized',
                 'delegate_profile_delegate_normalized',
                 'delegate_profile_delegate_nonzero'
               )
               AND convalidated
           )
           AND EXISTS (
             SELECT 1
             FROM pg_class index_class
             JOIN pg_index ON pg_index.indexrelid = index_class.oid
             WHERE index_class.oid = to_regclass('delegate_profile_backfill_scope_target_idx')
               AND pg_index.indrelid = to_regclass('delegate')
               AND pg_index.indisvalid
               AND pg_index.indisready
               AND pg_index.indnkeyatts = 4
               AND pg_index.indnatts = 4
               AND pg_get_indexdef(index_class.oid, 1, TRUE) = 'chain_id'
               AND pg_get_indexdef(index_class.oid, 2, TRUE) = 'dao_code'
               AND pg_get_indexdef(index_class.oid, 3, TRUE) = 'lower(governor_address)'
               AND pg_get_indexdef(index_class.oid, 4, TRUE) = 'lower(to_delegate)'
               AND pg_get_expr(pg_index.indpred, pg_index.indrelid, TRUE) =
                 'chain_id IS NOT NULL AND dao_code IS NOT NULL AND governor_address IS NOT NULL AND lower(to_delegate) <> ''0x0000000000000000000000000000000000000000''::text'
           )",
    )
    .fetch_one(pool)
    .await
    .map_err(|source| database_error("check delegate profile backfill prerequisites", source))?;
    let migration_table_exists: bool =
        sqlx::query_scalar("SELECT to_regclass('_sqlx_migrations') IS NOT NULL")
            .fetch_one(pool)
            .await
            .map_err(|source| database_error("check SQLx migration history", source))?;
    let migration_ready = if migration_table_exists {
        sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM _sqlx_migrations WHERE version = 11 AND success)",
        )
        .fetch_one(pool)
        .await
        .map_err(|source| database_error("check delegate profile migration version", source))?
    } else {
        false
    };

    if catalog_ready && migration_ready {
        Ok(())
    } else {
        Err(DelegateProfileBackfillError::Preflight(
            "migration 0011 and valid delegate_profile_backfill_scope_target_idx are required; run `degov-datalens-indexer migrate` first".to_owned(),
        ))
    }
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

fn i64_rows(value: i64) -> Result<usize, DelegateProfileBackfillError> {
    usize::try_from(value).map_err(|_| DelegateProfileBackfillError::RowCountOutOfRange)
}

fn database_error(operation: &'static str, source: sqlx::Error) -> DelegateProfileBackfillError {
    DelegateProfileBackfillError::Database { operation, source }
}
