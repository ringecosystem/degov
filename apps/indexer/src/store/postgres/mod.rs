use std::{
    collections::{HashMap, HashSet},
    fmt,
    future::Future,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use sqlx::{PgPool, Postgres, QueryBuilder, Row, Transaction};

use crate::{
    CheckpointRepository, ContributorVoteSignalWrite, DataMetricWrite,
    DatalensProvisionalSegmentStore, DatalensProvisionalSegmentWrite, DecodedTimelockEvent,
    DelegateChangedWrite, DelegateRollingWrite, DelegateVotesChangedWrite, GovernanceTokenStandard,
    IndexerCheckpoint, IndexerCheckpointIdentity, IndexerProjectionBatch, IndexerRunnerStore,
    IndexerRunnerTransaction, PowerReconcileCandidate, ProposalActionWrite, ProposalCreatedWrite,
    ProposalDeadlineExtensionWrite, ProposalExtendedWrite, ProposalIdWrite,
    ProposalProjectionBatch, ProposalQueuedWrite, ProposalStateEpochWrite, ProposalVoteTotalWrite,
    ProposalWrite, ProvisionalCleanupReport, ProvisionalCleanupStore,
    ProvisionalContributorPowerOverlayWrite, ProvisionalDelegatePowerOverlayRelation,
    ProvisionalDelegatePowerOverlayWrite, ProvisionalPowerOverlayScope,
    ProvisionalPowerOverlayStore, ProvisionalProposalOverlayStore, ProvisionalProposalOverlayWrite,
    ProvisionalRollbackReport, ProvisionalRollbackScope, ProvisionalSegmentCleanupCandidate,
    ProvisionalSegmentCleanupDecision, ProvisionalTimelockOperationOverlayWrite, TimelockCallWrite,
    TimelockMinDelayChangeWrite, TimelockOperationHintWrite, TimelockOperationWrite,
    TimelockProjectionBatch, TimelockProjectionContext, TimelockProjectionEvent,
    TimelockProposalActionLink, TimelockProposalLinkContext, TimelockRoleEventWrite,
    TokenEventCommon, TokenProjectionBatch, TokenProjectionOperation, TokenTransferWrite,
    VoteCastGroupWrite, VoteCastWithParamsWrite, VoteCastWrite, VoteProjectionBatch,
    plan_provisional_segment_cleanup,
};

#[derive(Clone)]
pub struct PostgresIndexerRunnerStore {
    pool: PgPool,
    checkpoint_repository: CheckpointRepository,
    onchain_refresh_debounce: Duration,
}

impl PostgresIndexerRunnerStore {
    pub fn new(pool: PgPool) -> Self {
        Self {
            checkpoint_repository: CheckpointRepository::new(pool.clone()),
            pool,
            onchain_refresh_debounce: DEFAULT_ONCHAIN_REFRESH_DEBOUNCE,
        }
    }

    pub fn with_onchain_refresh_debounce(mut self, debounce: Duration) -> Self {
        self.onchain_refresh_debounce = debounce;
        self
    }
}

const DEFAULT_ONCHAIN_REFRESH_DEBOUNCE: Duration = Duration::from_millis(120_000);

impl IndexerRunnerStore for PostgresIndexerRunnerStore {
    type Error = PostgresIndexerRunnerStoreError;
    type Transaction<'a> = PostgresIndexerRunnerTransaction<'a>;

    fn read_or_create_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        start_block: i64,
    ) -> Result<IndexerCheckpoint, Self::Error> {
        block_on_runtime(
            self.checkpoint_repository
                .read_or_create(identity, start_block),
        )
        .map_err(PostgresIndexerRunnerStoreError::from)
    }

    fn begin_transaction(&mut self) -> Result<Self::Transaction<'_>, Self::Error> {
        let transaction = block_on_runtime(self.pool.begin())?;

        Ok(PostgresIndexerRunnerTransaction {
            transaction: Some(transaction),
            checkpoint_repository: self.checkpoint_repository.clone(),
            onchain_refresh_debounce: self.onchain_refresh_debounce,
        })
    }

    fn timelock_proposal_link_context(
        &mut self,
        context: &TimelockProjectionContext,
        events: &[TimelockProjectionEvent],
        proposal: Option<&ProposalProjectionBatch>,
    ) -> Result<TimelockProposalLinkContext, Self::Error> {
        block_on_runtime(read_timelock_proposal_link_context(
            &self.pool, context, events, proposal,
        ))
    }
}

pub struct PostgresIndexerRunnerTransaction<'a> {
    transaction: Option<Transaction<'a, Postgres>>,
    checkpoint_repository: CheckpointRepository,
    onchain_refresh_debounce: Duration,
}

impl IndexerRunnerTransaction for PostgresIndexerRunnerTransaction<'_> {
    type Error = PostgresIndexerRunnerStoreError;

    fn apply_projection_batch(
        &mut self,
        batch: &IndexerProjectionBatch,
    ) -> Result<(), Self::Error> {
        let transaction = self
            .transaction
            .as_mut()
            .ok_or_else(|| PostgresIndexerRunnerStoreError::new("transaction is closed"))?;

        block_on_runtime(write_projection_batch(
            transaction,
            batch,
            self.onchain_refresh_debounce,
        ))
    }

    fn advance_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        target_height: Option<i64>,
    ) -> Result<(), Self::Error> {
        let transaction = self
            .transaction
            .as_mut()
            .ok_or_else(|| PostgresIndexerRunnerStoreError::new("transaction is closed"))?;

        block_on_runtime(self.checkpoint_repository.advance_after_projection(
            transaction,
            identity,
            processed_height,
            target_height,
        ))
        .map_err(PostgresIndexerRunnerStoreError::from)
    }

    fn commit(mut self) -> Result<(), Self::Error> {
        let transaction = self
            .transaction
            .take()
            .ok_or_else(|| PostgresIndexerRunnerStoreError::new("transaction is closed"))?;

        block_on_runtime(transaction.commit()).map_err(PostgresIndexerRunnerStoreError::from)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostgresIndexerRunnerStoreError {
    message: String,
}

impl PostgresIndexerRunnerStoreError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for PostgresIndexerRunnerStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for PostgresIndexerRunnerStoreError {}

impl From<sqlx::Error> for PostgresIndexerRunnerStoreError {
    fn from(error: sqlx::Error) -> Self {
        Self::new(format!("Postgres runner store error: {error}"))
    }
}

impl From<crate::CheckpointError> for PostgresIndexerRunnerStoreError {
    fn from(error: crate::CheckpointError) -> Self {
        Self::new(format!("Postgres runner checkpoint error: {error}"))
    }
}

fn block_on_runtime<F>(future: F) -> F::Output
where
    F: Future,
{
    tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(future))
}

async fn write_projection_batch(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &IndexerProjectionBatch,
    onchain_refresh_debounce: Duration,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if let Some(proposal) = &batch.proposal {
        write_proposal_batch_rows(transaction, proposal).await?;
    }
    if let Some(vote) = &batch.vote {
        write_vote_batch_rows(transaction, vote).await?;
    }
    let inserted_operation_ids = if let Some(token) = &batch.token {
        write_token_batch_rows(transaction, token).await?
    } else {
        Vec::new()
    };
    write_data_metric_timeline(
        transaction,
        &inserted_operation_ids,
        batch.proposal.as_ref(),
        batch.vote.as_ref(),
        batch.token.as_ref(),
    )
    .await?;
    if let Some(proposal) = &batch.proposal {
        refresh_proposal_data_metric(transaction, proposal).await?;
    }
    if let Some(vote) = &batch.vote {
        refresh_vote_data_metric(transaction, &vote.contributor_vote_signals).await?;
    }
    if let Some(token) = &batch.token {
        upsert_onchain_refresh_tasks(
            transaction,
            &token.reconcile_plan.candidates,
            onchain_refresh_debounce,
        )
        .await?;
    }
    if let Some(batch) = &batch.timelock {
        write_timelock_batch(transaction, batch).await?;
    }

    Ok(())
}

fn unix_time_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn duration_millis_i64(duration: Duration) -> i64 {
    duration.as_millis().min(i64::MAX as u128) as i64
}

include!("proposal.rs");
include!("vote.rs");
include!("data_metric.rs");
include!("token.rs");
include!("onchain_refresh.rs");
include!("timelock.rs");
include!("provisional.rs");
