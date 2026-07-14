use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// A simple in-memory cache entry with TTL
struct CacheEntry<T> {
    data: T,
    expires_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(data: T, ttl: Duration) -> Self {
        Self {
            data,
            expires_at: Instant::now() + ttl,
        }
    }

    fn is_valid(&self) -> bool {
        Instant::now() < self.expires_at
    }
}

/// Simple in-memory cache for low-churn data.
/// No external service needed — pure Rust.
pub struct SimpleCache {
    factions: RwLock<Option<CacheEntry<serde_json::Value>>>,
    territories: RwLock<Option<CacheEntry<serde_json::Value>>>,
    titles_definitions: RwLock<Option<CacheEntry<serde_json::Value>>>,
    ranks: RwLock<Option<CacheEntry<serde_json::Value>>>,
}

impl SimpleCache {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            factions: RwLock::new(None),
            territories: RwLock::new(None),
            titles_definitions: RwLock::new(None),
            ranks: RwLock::new(None),
        })
    }

    // ── Factions ──

    pub async fn get_factions(&self) -> Option<serde_json::Value> {
        let guard = self.factions.read().await;
        guard.as_ref().and_then(|e| if e.is_valid() { Some(e.data.clone()) } else { None })
    }

    pub async fn set_factions(&self, data: serde_json::Value) {
        let mut guard = self.factions.write().await;
        *guard = Some(CacheEntry::new(data, Duration::from_secs(15)));
    }

    // ── Territories ──

    pub async fn get_territories(&self) -> Option<serde_json::Value> {
        let guard = self.territories.read().await;
        guard.as_ref().and_then(|e| if e.is_valid() { Some(e.data.clone()) } else { None })
    }

    pub async fn set_territories(&self, data: serde_json::Value) {
        let mut guard = self.territories.write().await;
        *guard = Some(CacheEntry::new(data, Duration::from_secs(10)));
    }

    // ── Title Definitions (static — never changes) ──

    pub async fn get_titles_definitions(&self) -> Option<serde_json::Value> {
        let guard = self.titles_definitions.read().await;
        guard.as_ref().map(|e| e.data.clone())
    }

    pub async fn set_titles_definitions(&self, data: serde_json::Value) {
        let mut guard = self.titles_definitions.write().await;
        // Cache forever — titles are static
        *guard = Some(CacheEntry::new(data, Duration::from_secs(86400)));
    }

    // ── Ranks (static — never changes) ──

    pub async fn get_ranks(&self) -> Option<serde_json::Value> {
        let guard = self.ranks.read().await;
        guard.as_ref().map(|e| e.data.clone())
    }

    pub async fn set_ranks(&self, data: serde_json::Value) {
        let mut guard = self.ranks.write().await;
        *guard = Some(CacheEntry::new(data, Duration::from_secs(86400)));
    }
}
