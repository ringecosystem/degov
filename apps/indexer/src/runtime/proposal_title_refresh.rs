use anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;

use crate::{
    ProposalTitleRefreshCandidate, ProposalTitleRefreshUpdate, derive_proposal_metadata,
    read_proposal_title_refresh_candidates, required_env, update_proposal_titles,
};

use super::migrate::apply_migrations;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalTitleRefreshReport {
    pub dao_code: String,
    pub scanned: usize,
    pub updated: u64,
}

pub async fn refresh_proposal_titles(dao_code: String) -> Result<ProposalTitleRefreshReport> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    apply_migrations(&pool).await?;

    refresh_proposal_titles_with_pool(&pool, dao_code).await
}

pub async fn refresh_proposal_titles_with_pool(
    pool: &sqlx::PgPool,
    dao_code: String,
) -> Result<ProposalTitleRefreshReport> {
    let candidates = read_proposal_title_refresh_candidates(pool, &dao_code)
        .await
        .context("read proposal title refresh candidates")?;
    let scanned = candidates.len();
    let updates = tokio::task::spawn_blocking(move || plan_proposal_title_refreshes(&candidates))
        .await
        .context("derive proposal title refreshes")?;
    let updated = update_proposal_titles(pool, &dao_code, &updates)
        .await
        .context("update proposal titles")?;

    Ok(ProposalTitleRefreshReport {
        dao_code,
        scanned,
        updated,
    })
}

pub fn plan_proposal_title_refreshes(
    candidates: &[ProposalTitleRefreshCandidate],
) -> Vec<ProposalTitleRefreshUpdate> {
    plan_proposal_title_refreshes_with(candidates, |description| {
        derive_proposal_metadata(description).title
    })
}

fn plan_proposal_title_refreshes_with(
    candidates: &[ProposalTitleRefreshCandidate],
    derive_title: impl Fn(&str) -> String,
) -> Vec<ProposalTitleRefreshUpdate> {
    candidates
        .iter()
        .filter_map(|candidate| {
            let title = derive_title(&candidate.description);
            if title == candidate.title {
                None
            } else {
                Some(ProposalTitleRefreshUpdate {
                    id: candidate.id.clone(),
                    title,
                })
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_proposal_title_refreshes_updates_only_changed_titles() {
        let updates = plan_proposal_title_refreshes_with(
            &[
                ProposalTitleRefreshCandidate {
                    id: "proposal:1".to_owned(),
                    description: "# Fresh title\nBody".to_owned(),
                    title: "stale".to_owned(),
                },
                ProposalTitleRefreshCandidate {
                    id: "proposal:2".to_owned(),
                    description: "# Already fresh\nBody".to_owned(),
                    title: "Already fresh".to_owned(),
                },
            ],
            |description| {
                description
                    .lines()
                    .next()
                    .expect("test description has a first line")
                    .trim_start_matches("# ")
                    .to_owned()
            },
        );

        assert_eq!(
            updates,
            vec![ProposalTitleRefreshUpdate {
                id: "proposal:1".to_owned(),
                title: "Fresh title".to_owned(),
            }]
        );
    }
}
