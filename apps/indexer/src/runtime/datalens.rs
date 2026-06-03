use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use tokio::task;

use crate::{DatalensConfig, DatalensNativeClient, verify_datalens_service};

pub async fn smoke_datalens() -> Result<()> {
    let config = DatalensConfig::from_env_for_readiness().context("load Datalens configuration")?;
    verify_datalens(&config).await
}

pub async fn verify_datalens(config: &DatalensConfig) -> Result<()> {
    let config = config.clone();
    task::spawn_blocking(move || verify_datalens_blocking(&config))
        .await
        .context("join Datalens readiness task")?
}

fn verify_datalens_blocking(config: &DatalensConfig) -> Result<()> {
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
