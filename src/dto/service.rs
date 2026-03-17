use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::service::{SearchRow, ServiceRow};

#[derive(Debug, Serialize)]
pub struct ServiceDetail {
    pub id: Uuid,
    pub name: String,
    pub colors: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<Uuid>,
    pub category: String,
    pub logo_url: String,
    pub links: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ref_link: Option<String>,
}

impl ServiceDetail {
    pub fn from_row(row: ServiceRow, logo_url: String) -> Self {
        Self {
            id: row.id,
            name: row.name,
            colors: row.colors,
            category_id: row.category_id,
            category: row.category.unwrap_or_default(),
            logo_url,
            links: row.links,
            ref_link: row.ref_link,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "source", rename_all = "lowercase")]
pub enum SearchResult {
    Local {
        id: Uuid,
        name: String,
        logo_url: String,
    },
    Brandfetch {
        name: String,
        domain: String,
        icon: String,
    },
}

impl SearchResult {
    pub fn from_row(row: SearchRow, logo_url: String) -> Self {
        Self::Local {
            id: row.id,
            name: row.name,
            logo_url,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub count: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct InitQuery {
    pub country: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyReport {
    pub total: usize,
    pub verified_count: usize,
    pub not_found_count: usize,
    pub error_count: usize,
    pub verified: Vec<serde_json::Value>,
    pub not_found: Vec<String>,
    pub errors: Vec<serde_json::Value>,
}
