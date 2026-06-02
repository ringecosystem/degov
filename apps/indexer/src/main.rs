use std::{env, future};

use anyhow::Context;
use clap::{Parser, Subcommand};
use degov_datalens_indexer::{DatalensConfig, DatalensNativeClient, verify_datalens_service};
use sqlx::{Executor, postgres::PgPoolOptions};

const POSTGRES_SCHEMA_SQL: &str = include_str!("../schema/postgres.sql");

#[derive(Debug, Parser)]
#[command(name = "degov-datalens-indexer")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Run,
    Worker,
    Migrate,
    Graphql,
    SmokeDatalens,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_logging()?;
    let cli = Cli::parse();

    match cli.command {
        Command::Run => run_indexer().await,
        Command::Worker => run_worker().await,
        Command::Migrate => migrate().await,
        Command::Graphql => graphql(),
        Command::SmokeDatalens => smoke_datalens(),
    }
}

fn init_logging() -> anyhow::Result<()> {
    tracing_log::LogTracer::init().context("initialize log tracer")?;
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()
        .map_err(|error| anyhow::anyhow!("initialize tracing subscriber: {error}"))
}

fn smoke_datalens() -> anyhow::Result<()> {
    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    verify_datalens(&config)
}

async fn run_indexer() -> anyhow::Result<()> {
    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let contracts = config
        .dao_contracts
        .as_ref()
        .context("Datalens indexer run requires DATALENS_GOVERNOR_* contract envs")?;

    verify_datalens(&config)?;
    log::info!(
        "Datalens indexer runtime boundary is ready dao_chain={} dataset={} governor={} token={} timelock={} database_url_configured={}",
        config.chain.configured_name,
        config.dataset.key(),
        contracts.governor,
        contracts.governor_token,
        contracts.timelock,
        !database_url.is_empty()
    );
    log::info!("Datalens server is an external dependency; DeGov runs as an application consumer");

    wait_for_service_shutdown("Datalens indexer runtime").await
}

async fn run_worker() -> anyhow::Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let enabled = env::var("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED")
        .map(|value| onchain_refresh_worker_enabled(&value))
        .unwrap_or(Ok(true))?;

    if !enabled {
        log::info!(
            "onchain refresh worker is disabled by DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED; keeping service alive"
        );
        return wait_for_service_shutdown("disabled onchain refresh worker").await;
    }

    log::info!(
        "onchain refresh worker packaging is ready enabled={} database_url_configured={}",
        enabled,
        !database_url.is_empty()
    );
    log::info!("onchain refresh worker runtime will process refresh tasks in a follow-up package");

    wait_for_service_shutdown("onchain refresh worker").await
}

async fn wait_for_service_shutdown(service_name: &str) -> anyhow::Result<()> {
    log::info!("{service_name} service is running; stop the process to shut it down");
    future::pending::<()>().await;
    Ok(())
}

async fn migrate() -> anyhow::Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;

    for statement in postgres_schema_statements(POSTGRES_SCHEMA_SQL) {
        pool.execute(statement).await.with_context(|| {
            format!("apply Datalens-native DeGov indexer schema statement: {statement}")
        })?;
    }

    log::info!("Datalens-native DeGov indexer schema applied");

    Ok(())
}

fn graphql() -> anyhow::Result<()> {
    let endpoint = required_env("DEGOV_INDEXER_GRAPHQL_ENDPOINT")?;

    log::info!(
        "GraphQL/API packaging is configured endpoint={}; Datalens server remains external",
        endpoint
    );

    Ok(())
}

fn verify_datalens(config: &DatalensConfig) -> anyhow::Result<()> {
    log::info!(
        "checking Datalens readiness for application {} at {}",
        config.application,
        config.endpoint
    );
    let client = DatalensNativeClient::from_config(config).context("create Datalens client")?;
    verify_datalens_service(&client).context("verify Datalens service")?;
    log::info!("Datalens native GraphQL readiness confirmed");

    Ok(())
}

fn required_env(name: &'static str) -> anyhow::Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    let value = value.trim().to_owned();

    if value.is_empty() {
        anyhow::bail!("{name} must not be empty");
    }

    Ok(value)
}

fn onchain_refresh_worker_enabled(value: &str) -> anyhow::Result<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        _ => anyhow::bail!(
            "DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED must be one of true, false, 1, 0, yes, or no"
        ),
    }
}

fn postgres_schema_statements(sql: &str) -> Vec<&str> {
    let mut statements = Vec::new();
    let mut statement_start = 0;
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut dollar_quote_tag: Option<&str> = None;
    let mut chars = sql.char_indices().peekable();

    while let Some((index, character)) = chars.next() {
        let rest = &sql[index..];

        if let Some(tag) = dollar_quote_tag {
            if rest.starts_with(tag) {
                dollar_quote_tag = None;
                for _ in 1..tag.chars().count() {
                    chars.next();
                }
            }
            continue;
        }

        if in_line_comment {
            if character == '\n' {
                in_line_comment = false;
            }
            continue;
        }

        if in_block_comment {
            if rest.starts_with("*/") {
                in_block_comment = false;
                chars.next();
            }
            continue;
        }

        if in_single_quote {
            if character == '\'' {
                if matches!(chars.peek(), Some((_, '\''))) {
                    chars.next();
                } else {
                    in_single_quote = false;
                }
            }
            continue;
        }

        if in_double_quote {
            if character == '"' {
                in_double_quote = false;
            }
            continue;
        }

        if rest.starts_with("--") {
            in_line_comment = true;
            chars.next();
            continue;
        }

        if rest.starts_with("/*") {
            in_block_comment = true;
            chars.next();
            continue;
        }

        if character == '\'' {
            in_single_quote = true;
            continue;
        }

        if character == '"' {
            in_double_quote = true;
            continue;
        }

        if character == '$' {
            if let Some(tag_end) = rest[1..].find('$') {
                let tag = &rest[..=tag_end + 1];

                if tag[1..tag.len() - 1]
                    .chars()
                    .all(|tag_char| tag_char == '_' || tag_char.is_ascii_alphanumeric())
                {
                    dollar_quote_tag = Some(tag);
                    for _ in 1..tag.chars().count() {
                        chars.next();
                    }
                }
            }
            continue;
        }

        if character == ';' {
            let statement = sql[statement_start..index].trim();

            if !statement.is_empty() {
                statements.push(statement);
            }

            statement_start = index + character.len_utf8();
        }
    }

    let statement = sql[statement_start..].trim();

    if !statement.is_empty() {
        statements.push(statement);
    }

    statements
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_postgres_schema_statements_splits_schema_into_individual_statements() {
        let statements = postgres_schema_statements(
            "CREATE TABLE one (id INTEGER);\n\n-- comment with ;\nCREATE INDEX one_id_idx ON one (id);\n",
        );

        assert_eq!(
            statements,
            vec![
                "CREATE TABLE one (id INTEGER)",
                "-- comment with ;\nCREATE INDEX one_id_idx ON one (id)"
            ]
        );
    }

    #[test]
    fn test_onchain_refresh_worker_enabled_accepts_disabled_values() {
        assert!(!onchain_refresh_worker_enabled("false").expect("false parses"));
        assert!(!onchain_refresh_worker_enabled("0").expect("0 parses"));
        assert!(!onchain_refresh_worker_enabled("no").expect("no parses"));
    }

    #[test]
    fn test_onchain_refresh_worker_enabled_rejects_ambiguous_values() {
        let error = onchain_refresh_worker_enabled("disabled").expect_err("disabled is invalid");

        assert!(
            error
                .to_string()
                .contains("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED")
        );
    }
}
