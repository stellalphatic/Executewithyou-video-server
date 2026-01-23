//! S3/R2 client initialization

use crate::Config;
use anyhow::Result;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::Region;
use aws_sdk_s3::Client as S3Client;

/// Create S3 client configured for R2 or MinIO
pub async fn create_s3_client(config: &Config) -> Result<S3Client> {
    let credentials = Credentials::new(
        &config.s3_access_key,
        &config.s3_secret_key,
        None,
        None,
        "static",
    );

    let s3_config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(config.s3_region.clone()))
        .endpoint_url(&config.s3_endpoint)
        .credentials_provider(credentials)
        .force_path_style(true) // Required for MinIO and R2
        .build();

    Ok(S3Client::from_conf(s3_config))
}
