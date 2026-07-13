use axum::{
    extract::State,
    Json,
};
use serde::Serialize;

use crate::ServerState;

/// A single rank definition
pub struct RankDef {
    pub level: u32,
    pub tier: &'static str,
    pub name: &'static str,
    pub min_influence: i32,
}

/// Serializable rank info returned to the client
#[derive(Debug, Clone, Serialize)]
pub struct RankInfo {
    pub level: u32,
    pub tier: String,
    pub name: String,
    pub min_influence: i32,
    pub next_min_influence: Option<i32>,
    pub progress: f64, // 0.0 to 1.0 progress to next rank
}

// ─── ALL 43 RANKS ──────────────────────────────────────────────────────────

const RANKS: &[RankDef] = &[
    // Tier 1: Street (Ranks 1–5)
    RankDef { level: 1,  tier: "Street",      name: "Fresh Meat",        min_influence: 0 },
    RankDef { level: 2,  tier: "Street",      name: "Street Rat",        min_influence: 10 },
    RankDef { level: 3,  tier: "Street",      name: "Bag Man",           min_influence: 25 },
    RankDef { level: 4,  tier: "Street",      name: "Lookout",           min_influence: 50 },
    RankDef { level: 5,  tier: "Street",      name: "Courier",           min_influence: 100 },
    // Tier 2: Bronze (Ranks 6–10)
    RankDef { level: 6,  tier: "Bronze",      name: "Bronze Grunt",      min_influence: 200 },
    RankDef { level: 7,  tier: "Bronze",      name: "Bronze Enforcer",   min_influence: 350 },
    RankDef { level: 8,  tier: "Bronze",      name: "Bronze Shade",      min_influence: 500 },
    RankDef { level: 9,  tier: "Bronze",      name: "Bronze Blade",      min_influence: 700 },
    RankDef { level: 10, tier: "Bronze",     name: "Bronze Talon",      min_influence: 1000 },
    // Tier 3: Silver (Ranks 11–16)
    RankDef { level: 11, tier: "Silver",     name: "Silver Hound",      min_influence: 1400 },
    RankDef { level: 12, tier: "Silver",     name: "Silver Wolf",       min_influence: 1800 },
    RankDef { level: 13, tier: "Silver",     name: "Silver Viper",      min_influence: 2300 },
    RankDef { level: 14, tier: "Silver",     name: "Silver Fox",        min_influence: 2800 },
    RankDef { level: 15, tier: "Silver",     name: "Silver Lion",       min_influence: 3500 },
    RankDef { level: 16, tier: "Silver",     name: "Silver Bear",       min_influence: 4200 },
    // Tier 4: Gold (Ranks 17–22)
    RankDef { level: 17, tier: "Gold",       name: "Gold Jackal",       min_influence: 5000 },
    RankDef { level: 18, tier: "Gold",       name: "Gold Panther",      min_influence: 6000 },
    RankDef { level: 19, tier: "Gold",       name: "Gold Tiger",        min_influence: 7200 },
    RankDef { level: 20, tier: "Gold",       name: "Gold Dragon",       min_influence: 8500 },
    RankDef { level: 21, tier: "Gold",       name: "Gold Phoenix",      min_influence: 10000 },
    RankDef { level: 22, tier: "Gold",       name: "Gold Griffin",      min_influence: 12000 },
    // Tier 5: Platinum (Ranks 23–28)
    RankDef { level: 23, tier: "Platinum",   name: "Platinum Warden",   min_influence: 14000 },
    RankDef { level: 24, tier: "Platinum",   name: "Platinum Sentinel", min_influence: 16500 },
    RankDef { level: 25, tier: "Platinum",   name: "Platinum Guardian", min_influence: 19000 },
    RankDef { level: 26, tier: "Platinum",   name: "Platinum Paladin",  min_influence: 22000 },
    RankDef { level: 27, tier: "Platinum",   name: "Platinum Champion", min_influence: 25000 },
    RankDef { level: 28, tier: "Platinum",   name: "Platinum Overlord", min_influence: 28000 },
    // Tier 6: Diamond (Ranks 29–34)
    RankDef { level: 29, tier: "Diamond",    name: "Diamond Knight",    min_influence: 32000 },
    RankDef { level: 30, tier: "Diamond",    name: "Diamond Baron",     min_influence: 36000 },
    RankDef { level: 31, tier: "Diamond",    name: "Diamond Duke",      min_influence: 41000 },
    RankDef { level: 32, tier: "Diamond",    name: "Diamond Prince",    min_influence: 46000 },
    RankDef { level: 33, tier: "Diamond",    name: "Diamond King",      min_influence: 52000 },
    RankDef { level: 34, tier: "Diamond",    name: "Diamond Emperor",   min_influence: 58000 },
    // Tier 7: Legendary (Ranks 35–39)
    RankDef { level: 35, tier: "Legendary",  name: "Legendary Phantom", min_influence: 65000 },
    RankDef { level: 36, tier: "Legendary",  name: "Legendary Reaper",  min_influence: 73000 },
    RankDef { level: 37, tier: "Legendary",  name: "Legendary Wraith",  min_influence: 82000 },
    RankDef { level: 38, tier: "Legendary",  name: "Legendary Spectre", min_influence: 92000 },
    RankDef { level: 39, tier: "Legendary",  name: "Legendary Ghost",   min_influence: 105000 },
    // Tier 8: Mythic (Ranks 40–43)
    RankDef { level: 40, tier: "Mythic",     name: "Mythic Shadow",     min_influence: 120000 },
    RankDef { level: 41, tier: "Mythic",     name: "Mythic Void",       min_influence: 140000 },
    RankDef { level: 42, tier: "Mythic",     name: "Mythic Abyss",      min_influence: 165000 },
    RankDef { level: 43, tier: "Mythic",     name: "Mythic Omega",      min_influence: 200000 },
];

/// Returns the rank corresponding to a given influence value.
pub fn calculate_rank(influence: i32) -> &'static RankDef {
    RANKS
        .iter()
        .rev()
        .find(|r| influence >= r.min_influence)
        .unwrap_or(&RANKS[0])
}

/// Returns full RankInfo with progress to next rank, or max-rank info if already at the top.
pub fn get_rank_info(influence: i32) -> RankInfo {
    let current = calculate_rank(influence);
    let next = RANKS.iter().find(|r| r.level == current.level + 1);

    let (next_min, progress) = match next {
        Some(n) => {
            let range = n.min_influence - current.min_influence;
            let earned = influence - current.min_influence;
            let p = if range > 0 {
                (earned as f64 / range as f64).clamp(0.0, 1.0)
            } else {
                1.0
            };
            (Some(n.min_influence), p)
        }
        None => (None, 1.0),
    };

    RankInfo {
        level: current.level,
        tier: current.tier.to_string(),
        name: current.name.to_string(),
        min_influence: current.min_influence,
        next_min_influence: next_min,
        progress,
    }
}

/// Get all ranks (useful for a rank reference endpoint)
pub fn get_all_ranks() -> Vec<RankInfo> {
    RANKS.iter().map(|r| RankInfo {
        level: r.level,
        tier: r.tier.to_string(),
        name: r.name.to_string(),
        min_influence: r.min_influence,
        next_min_influence: None,
        progress: 1.0,
    }).collect()
}

pub async fn get_ranks_endpoint(
    State(_state): State<ServerState>,
) -> Json<Vec<RankInfo>> {
    Json(get_all_ranks())
}
