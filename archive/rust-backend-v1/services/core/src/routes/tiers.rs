//! Tier and subscription management routes
//!
//! Handles user tier validation, limits checking, and subscription info.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::AppState;

/// Tier levels (matches frontend Tier enum)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Tier {
    Free = 1,
    Creator = 2,
    Pro = 3,
    Broadcast = 4,
    Enterprise = 5,
}

impl Default for Tier {
    fn default() -> Self {
        Tier::Free
    }
}

impl From<i32> for Tier {
    fn from(value: i32) -> Self {
        match value {
            1 => Tier::Free,
            2 => Tier::Creator,
            3 => Tier::Pro,
            4 => Tier::Broadcast,
            5 => Tier::Enterprise,
            _ => Tier::Free,
        }
    }
}

/// Tier limits structure
#[derive(Debug, Clone, Serialize)]
pub struct TierLimits {
    pub max_stage_participants: i32,
    pub max_total_participants: i32,
    pub max_destinations: i32,
    pub max_recording_duration_minutes: i32,
    pub recording_enabled: bool,
    pub iso_recording_enabled: bool,
    pub custom_rtmp_allowed: bool,
    pub max_resolution: String,
    pub max_concurrent_streams: i32,
}

impl TierLimits {
    pub fn for_tier(tier: Tier) -> Self {
        match tier {
            Tier::Free => TierLimits {
                max_stage_participants: 2,
                max_total_participants: 4,
                max_destinations: 1,
                max_recording_duration_minutes: 0,
                recording_enabled: false,
                iso_recording_enabled: false,
                custom_rtmp_allowed: false,
                max_resolution: "720p".to_string(),
                max_concurrent_streams: 1,
            },
            Tier::Creator => TierLimits {
                max_stage_participants: 4,
                max_total_participants: 10,
                max_destinations: 3,
                max_recording_duration_minutes: 120,
                recording_enabled: true,
                iso_recording_enabled: false,
                custom_rtmp_allowed: true,
                max_resolution: "1080p".to_string(),
                max_concurrent_streams: 1,
            },
            Tier::Pro => TierLimits {
                max_stage_participants: 6,
                max_total_participants: 25,
                max_destinations: 5,
                max_recording_duration_minutes: 480,
                recording_enabled: true,
                iso_recording_enabled: true,
                custom_rtmp_allowed: true,
                max_resolution: "1080p".to_string(),
                max_concurrent_streams: 2,
            },
            Tier::Broadcast => TierLimits {
                max_stage_participants: 10,
                max_total_participants: 50,
                max_destinations: 10,
                max_recording_duration_minutes: 1440,
                recording_enabled: true,
                iso_recording_enabled: true,
                custom_rtmp_allowed: true,
                max_resolution: "4k".to_string(),
                max_concurrent_streams: 5,
            },
            Tier::Enterprise => TierLimits {
                max_stage_participants: 25,
                max_total_participants: 100,
                max_destinations: -1, // Unlimited
                max_recording_duration_minutes: -1, // Unlimited
                recording_enabled: true,
                iso_recording_enabled: true,
                custom_rtmp_allowed: true,
                max_resolution: "4k".to_string(),
                max_concurrent_streams: -1, // Unlimited
            },
        }
    }
}

/// Subscription info
#[derive(Debug, Clone, Serialize)]
pub struct SubscriptionInfo {
    pub plan_id: String,
    pub status: String,
    pub current_period_end: String,
}

/// Response for GET /users/:user_id/tier
#[derive(Debug, Serialize)]
pub struct GetUserTierResponse {
    pub tier: Tier,
    pub limits: TierLimits,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription: Option<SubscriptionInfo>,
}

/// Get user's current tier and limits
pub async fn get_user_tier(
    Path(user_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<GetUserTierResponse>, (StatusCode, String)> {
    info!(user_id = %user_id, "Getting user tier");

    // TODO: Fetch from database - for now return based on user lookup
    // In production, this would query the subscriptions table
    let tier = match state.db.get_user_tier(&user_id).await {
        Ok(Some(tier_level)) => Tier::from(tier_level),
        Ok(None) => Tier::Free, // Default to free tier
        Err(e) => {
            tracing::warn!(error = %e, "Failed to get user tier, defaulting to Free");
            Tier::Free
        }
    };

    let limits = TierLimits::for_tier(tier);

    Ok(Json(GetUserTierResponse {
        tier,
        limits,
        subscription: None, // TODO: Fetch from Stripe/payment provider
    }))
}

/// Request body for tier action validation
#[derive(Debug, Deserialize)]
pub struct ValidateTierActionRequest {
    pub action: String,
    pub context: serde_json::Value,
}

/// Response for POST /users/:user_id/tier/validate
#[derive(Debug, Serialize)]
pub struct ValidateTierActionResponse {
    pub allowed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upgrade_suggestion: Option<UpgradeSuggestion>,
}

#[derive(Debug, Serialize)]
pub struct UpgradeSuggestion {
    pub tier: Tier,
    pub message: String,
}

/// Validate if an action is allowed based on user's tier
pub async fn validate_tier_action(
    Path(user_id): Path<String>,
    State(state): State<AppState>,
    Json(req): Json<ValidateTierActionRequest>,
) -> Result<Json<ValidateTierActionResponse>, (StatusCode, String)> {
    info!(user_id = %user_id, action = %req.action, "Validating tier action");

    let tier = match state.db.get_user_tier(&user_id).await {
        Ok(Some(tier_level)) => Tier::from(tier_level),
        Ok(None) => Tier::Free,
        Err(_) => Tier::Free,
    };

    let limits = TierLimits::for_tier(tier);

    let (allowed, reason, upgrade) = match req.action.as_str() {
        "ADD_STAGE_PARTICIPANT" => {
            let current_count = req.context.get("currentCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            if current_count >= limits.max_stage_participants {
                (
                    false,
                    Some(format!("Stage is full ({} max)", limits.max_stage_participants)),
                    Some(UpgradeSuggestion {
                        tier: next_tier(tier),
                        message: format!(
                            "Upgrade to {} for {} stage participants",
                            tier_name(next_tier(tier)),
                            TierLimits::for_tier(next_tier(tier)).max_stage_participants
                        ),
                    }),
                )
            } else {
                (true, None, None)
            }
        }
        "ADD_DESTINATION" => {
            let current_count = req.context.get("currentCount")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            if limits.max_destinations != -1 && current_count >= limits.max_destinations {
                (
                    false,
                    Some(format!("Maximum destinations reached ({})", limits.max_destinations)),
                    Some(UpgradeSuggestion {
                        tier: next_tier(tier),
                        message: format!(
                            "Upgrade to {} for {} destinations",
                            tier_name(next_tier(tier)),
                            TierLimits::for_tier(next_tier(tier)).max_destinations
                        ),
                    }),
                )
            } else {
                (true, None, None)
            }
        }
        "ADD_CUSTOM_RTMP" => {
            if !limits.custom_rtmp_allowed {
                (
                    false,
                    Some("Custom RTMP not available on your plan".to_string()),
                    Some(UpgradeSuggestion {
                        tier: Tier::Creator,
                        message: "Upgrade to Creator for custom RTMP".to_string(),
                    }),
                )
            } else {
                (true, None, None)
            }
        }
        "START_RECORDING" => {
            if !limits.recording_enabled {
                (
                    false,
                    Some("Recording not available on your plan".to_string()),
                    Some(UpgradeSuggestion {
                        tier: Tier::Creator,
                        message: "Upgrade to Creator for recording".to_string(),
                    }),
                )
            } else {
                (true, None, None)
            }
        }
        "START_ISO_RECORDING" => {
            if !limits.iso_recording_enabled {
                (
                    false,
                    Some("ISO recording not available on your plan".to_string()),
                    Some(UpgradeSuggestion {
                        tier: Tier::Pro,
                        message: "Upgrade to Pro for ISO recording".to_string(),
                    }),
                )
            } else {
                (true, None, None)
            }
        }
        _ => (true, None, None),
    };

    Ok(Json(ValidateTierActionResponse {
        allowed,
        reason,
        upgrade_suggestion: upgrade,
    }))
}

/// Upgrade option info
#[derive(Debug, Serialize)]
pub struct UpgradeOption {
    pub tier: Tier,
    pub name: String,
    pub price_monthly: f64,
    pub price_yearly: f64,
    pub highlights: Vec<String>,
}

/// Response for GET /users/:user_id/tier/upgrade-options
#[derive(Debug, Serialize)]
pub struct GetUpgradeOptionsResponse {
    pub current_tier: Tier,
    pub options: Vec<UpgradeOption>,
}

/// Get available upgrade options for a user
pub async fn get_upgrade_options(
    Path(user_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<GetUpgradeOptionsResponse>, (StatusCode, String)> {
    let tier = match state.db.get_user_tier(&user_id).await {
        Ok(Some(tier_level)) => Tier::from(tier_level),
        Ok(None) => Tier::Free,
        Err(_) => Tier::Free,
    };

    let all_options = vec![
        UpgradeOption {
            tier: Tier::Creator,
            name: "Creator".to_string(),
            price_monthly: 19.0,
            price_yearly: 190.0,
            highlights: vec![
                "4 on stage".to_string(),
                "3 destinations".to_string(),
                "1080p streaming".to_string(),
                "Custom branding".to_string(),
                "Recording (2h)".to_string(),
            ],
        },
        UpgradeOption {
            tier: Tier::Pro,
            name: "Pro".to_string(),
            price_monthly: 49.0,
            price_yearly: 490.0,
            highlights: vec![
                "6 on stage".to_string(),
                "5 destinations".to_string(),
                "1080p @ 60fps".to_string(),
                "ISO recording".to_string(),
                "Analytics".to_string(),
                "API access".to_string(),
            ],
        },
        UpgradeOption {
            tier: Tier::Broadcast,
            name: "Broadcast".to_string(),
            price_monthly: 149.0,
            price_yearly: 1490.0,
            highlights: vec![
                "10 on stage".to_string(),
                "10 destinations".to_string(),
                "4K streaming".to_string(),
                "Priority support".to_string(),
                "SLA guarantee".to_string(),
            ],
        },
        UpgradeOption {
            tier: Tier::Enterprise,
            name: "Enterprise".to_string(),
            price_monthly: 0.0, // Contact sales
            price_yearly: 0.0,
            highlights: vec![
                "25+ on stage".to_string(),
                "Unlimited destinations".to_string(),
                "Custom integrations".to_string(),
                "Dedicated support".to_string(),
                "On-premise option".to_string(),
            ],
        },
    ];

    // Filter to only show tiers above current
    let options: Vec<UpgradeOption> = all_options
        .into_iter()
        .filter(|opt| opt.tier > tier)
        .collect();

    Ok(Json(GetUpgradeOptionsResponse {
        current_tier: tier,
        options,
    }))
}

fn next_tier(current: Tier) -> Tier {
    match current {
        Tier::Free => Tier::Creator,
        Tier::Creator => Tier::Pro,
        Tier::Pro => Tier::Broadcast,
        Tier::Broadcast => Tier::Enterprise,
        Tier::Enterprise => Tier::Enterprise,
    }
}

fn tier_name(tier: Tier) -> &'static str {
    match tier {
        Tier::Free => "Free",
        Tier::Creator => "Creator",
        Tier::Pro => "Pro",
        Tier::Broadcast => "Broadcast",
        Tier::Enterprise => "Enterprise",
    }
}
