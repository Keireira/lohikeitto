use std::collections::HashSet;

use serde::{Deserialize, Serialize, de};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Source {
    Inhouse,
    Brandfetch,
    Logodev,
    AppStore,
}

#[derive(Debug)]
pub struct SearchSources(HashSet<Source>);

impl SearchSources {
    pub fn has(&self, source: Source) -> bool {
        self.0.contains(&source)
    }

    fn parse(s: &str) -> Result<Self, String> {
        let mut set = HashSet::new();

        for token in s.split(',').map(|t| t.trim()) {
            match token.to_lowercase().as_str() {
                "inhouse" => {
                    set.insert(Source::Inhouse);
                }
                "brandfetch" => {
                    set.insert(Source::Brandfetch);
                }
                "logodev" => {
                    set.insert(Source::Logodev);
                }
                "appstore" => {
                    set.insert(Source::AppStore);
                }
                "mobile" => {
                    set.insert(Source::AppStore);
                }
                "external" => {
                    set.insert(Source::Brandfetch);
                    set.insert(Source::Logodev);
                    set.insert(Source::AppStore);
                }
                "all" => {
                    set.insert(Source::Inhouse);
                    set.insert(Source::Brandfetch);
                    set.insert(Source::Logodev);
                    set.insert(Source::AppStore);
                }
                other => return Err(format!("unknown source: {other}")),
            }
        }
        Ok(Self(set))
    }
}

impl Default for SearchSources {
    fn default() -> Self {
        Self::parse("all").unwrap()
    }
}

fn deserialize_sources<'de, D>(deserializer: D) -> Result<SearchSources, D::Error>
where
    D: de::Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    SearchSources::parse(&s).map_err(de::Error::custom)
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default, deserialize_with = "deserialize_sources")]
    pub sources: SearchSources,
}

#[derive(Debug, Serialize, ToSchema)]
#[schema(example = json!({
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "logo_url": "https://s3.uha.app/logos/adguard.webp",
    "name": "AdGuard",
    "domains": ["adguard.com"],
    "source": "inhouse"
}))]
pub struct SearchResult {
    /// For inhouse results — UUID v4 from DB; for external — deterministic UUID v5 from first domain
    pub id: Uuid,
    /// Logo image URL
    #[schema(example = "https://s3.uha.app/logos/adguard.webp")]
    pub logo_url: String,
    /// Service name
    #[schema(example = "AdGuard")]
    pub name: String,
    /// Service domains. Inhouse (curated) results may have multiple; external results always have one.
    pub domains: Vec<String>,
    /// Result source: `inhouse`, `brandfetch`, `logo.dev`, or `appstore`
    #[schema(example = "inhouse")]
    pub source: String,
}
