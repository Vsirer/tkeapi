/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 对象存储门面：TOS / COS 共用上传、删除、预签名、列举，调用方不绑厂商签名。

use std::collections::HashMap;

use crate::models::StorageSettings;
use crate::services::cos::{self, CosConfig};
use crate::services::tos::{self, TosConfig, TosObject};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StoreKind {
    Tos,
    Cos,
}

/// 插件 `default_provider=global`：上传跟随站点设置，不是一个独立厂商。
pub fn is_global_storage_default(s: &str) -> bool {
    s.eq_ignore_ascii_case("global")
}

impl StoreKind {
    pub const ALL: [Self; 2] = [Self::Tos, Self::Cos];

    pub fn parse(s: &str) -> Self {
        if s.eq_ignore_ascii_case("cos") {
            StoreKind::Cos
        } else {
            StoreKind::Tos
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            StoreKind::Tos => "tos",
            StoreKind::Cos => "cos",
        }
    }
}

#[derive(Debug, Clone)]
pub enum ObjectStore {
    Tos(TosConfig),
    Cos(CosConfig),
}

impl ObjectStore {
    pub fn provider(&self) -> &'static str {
        match self {
            ObjectStore::Tos(_) => StoreKind::Tos.as_str(),
            ObjectStore::Cos(_) => StoreKind::Cos.as_str(),
        }
    }

    pub fn bucket(&self) -> &str {
        match self {
            ObjectStore::Tos(c) => &c.bucket,
            ObjectStore::Cos(c) => &c.bucket,
        }
    }

    pub fn endpoint(&self) -> &str {
        match self {
            ObjectStore::Tos(c) => &c.endpoint,
            ObjectStore::Cos(c) => &c.endpoint,
        }
    }

    pub fn path_prefix(&self) -> &str {
        match self {
            ObjectStore::Tos(c) => &c.path_prefix,
            ObjectStore::Cos(c) => &c.path_prefix,
        }
    }

    pub fn region(&self) -> &str {
        match self {
            ObjectStore::Tos(c) => &c.region,
            ObjectStore::Cos(c) => &c.region,
        }
    }

    pub fn from_settings(s: &StorageSettings) -> Option<Self> {
        let p = s.default_provider.trim();
        if p.is_empty() || p.eq_ignore_ascii_case("none") {
            return None;
        }
        Self::from_settings_for(s, StoreKind::parse(&s.default_provider))
    }

    pub fn from_settings_for(s: &StorageSettings, kind: StoreKind) -> Option<Self> {
        match kind {
            StoreKind::Tos => tos_from_settings(s).map(ObjectStore::Tos),
            StoreKind::Cos => CosConfig::from_fields(
                &s.cos_secret_id,
                &s.cos_secret_key,
                &s.cos_endpoint,
                &s.cos_region,
                &s.cos_bucket,
                &s.cos_path_prefix,
                &s.cos_custom_domain,
            )
            .map(ObjectStore::Cos),
        }
    }

    pub fn from_plugin_map_for(map: &HashMap<String, String>, kind: StoreKind) -> Option<Self> {
        match kind {
            StoreKind::Tos => TosConfig::from_map(map).map(ObjectStore::Tos),
            StoreKind::Cos => CosConfig::from_map(map).map(ObjectStore::Cos),
        }
    }

    pub fn full_key(&self, filename: &str) -> String {
        match self {
            ObjectStore::Tos(c) => c.full_key(filename),
            ObjectStore::Cos(c) => c.full_key(filename),
        }
    }

    pub fn file_url(&self, object_key: &str) -> String {
        match self {
            ObjectStore::Tos(c) => c.file_url(object_key),
            ObjectStore::Cos(c) => c.file_url(object_key),
        }
    }

    pub fn extract_object_key(&self, file_url: &str) -> Option<String> {
        match self {
            ObjectStore::Tos(c) => c.extract_object_key(file_url),
            ObjectStore::Cos(c) => c.extract_object_key(file_url),
        }
    }

    pub async fn test_connection(&self) -> Result<String, String> {
        match self {
            ObjectStore::Tos(c) => tos::test_connection(c).await,
            ObjectStore::Cos(c) => cos::test_connection(c).await,
        }
    }

    pub async fn upload_file(
        &self,
        object_key: &str,
        data: Vec<u8>,
        content_type: &str,
        tags: Option<&str>,
    ) -> Result<String, String> {
        match self {
            ObjectStore::Tos(c) => tos::upload_file(c, object_key, data, content_type, tags).await,
            ObjectStore::Cos(c) => cos::upload_file(c, object_key, data, content_type, tags).await,
        }
    }

    pub async fn delete_file(&self, object_key: &str) -> Result<(), String> {
        match self {
            ObjectStore::Tos(c) => tos::delete_file(c, object_key).await,
            ObjectStore::Cos(c) => cos::delete_file(c, object_key).await,
        }
    }

    pub fn generate_presigned_put_url(&self, object_key: &str, expires_secs: u64) -> String {
        match self {
            ObjectStore::Tos(c) => tos::generate_presigned_put_url(c, object_key, expires_secs),
            ObjectStore::Cos(c) => cos::generate_presigned_put_url(c, object_key, expires_secs),
        }
    }

    pub async fn update_object_tags(
        &self,
        object_key: &str,
        tags: HashMap<String, String>,
    ) -> Result<(), String> {
        match self {
            ObjectStore::Tos(c) => tos::update_object_tags(c, object_key, tags).await,
            ObjectStore::Cos(c) => cos::update_object_tags(c, object_key, tags).await,
        }
    }

    pub async fn list_folder(&self, folder_prefix: &str) -> Result<(Vec<TosObject>, i64), String> {
        match self {
            ObjectStore::Tos(c) => tos::list_folder(c, folder_prefix).await,
            ObjectStore::Cos(c) => cos::list_folder(c, folder_prefix).await,
        }
    }

    pub fn collect_object_keys(
        &self,
        keys_and_urls: impl IntoIterator<Item = (String, String)>,
    ) -> Vec<String> {
        collect_keys_with(self, keys_and_urls)
    }

    pub fn spawn_purge(
        self,
        relative_prefix: String,
        extra_keys: Vec<String>,
        label: &'static str,
        id: i64,
    ) {
        match self {
            ObjectStore::Tos(c) => tos::spawn_purge(c, relative_prefix, extra_keys, label, id),
            store @ ObjectStore::Cos(_) => {
                tokio::spawn(async move {
                    let report = store.purge_prefix(&relative_prefix, extra_keys).await;
                    if report.ok {
                        tracing::info!("{} {} 对象存储清理成功 {}", label, id, report.detail);
                    } else {
                        tracing::warn!("{} {} 对象存储清理异常 {}", label, id, report.detail);
                    }
                });
            }
        }
    }

    async fn purge_prefix(&self, relative_prefix: &str, extra_keys: Vec<String>) -> PurgeReport {
        let prefix = relative_prefix.trim().trim_matches('/').to_string();
        let mut keys = std::collections::HashSet::<String>::new();
        for key in &extra_keys {
            let key = key.trim().trim_start_matches('/');
            if !key.is_empty() {
                keys.insert(key.to_string());
            }
        }
        match self.list_folder(&format!("{prefix}/")).await {
            Ok((objects, _)) => {
                for obj in objects {
                    let key = obj.key.trim().trim_start_matches('/');
                    if !key.is_empty() {
                        keys.insert(key.to_string());
                    }
                }
            }
            Err(e) => {
                return PurgeReport {
                    ok: false,
                    detail: format!(
                        "prefix={} list=ERR {}",
                        self.full_key(&format!("{prefix}/")),
                        e
                    ),
                };
            }
        }
        keys.insert(self.full_key(&format!("{prefix}/.keep")));
        let mut fail = 0usize;
        let mut errs = Vec::new();
        for key in &keys {
            if let Err(e) = self.delete_file(key).await {
                fail += 1;
                if errs.len() < 5 {
                    errs.push(format!("{key}: {e}"));
                }
            }
        }
        let detail = format!(
            "prefix={} list=ok keys={} fail={}{}",
            self.full_key(&format!("{prefix}/")),
            keys.len(),
            fail,
            if errs.is_empty() {
                String::new()
            } else {
                format!(" errs={}", errs.join(" | "))
            }
        );
        PurgeReport {
            ok: fail == 0,
            detail,
        }
    }
}

struct PurgeReport {
    ok: bool,
    detail: String,
}

fn collect_keys_with(
    store: &ObjectStore,
    keys_and_urls: impl IntoIterator<Item = (String, String)>,
) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (key, url) in keys_and_urls {
        for candidate in [key, url] {
            let k = candidate.trim().trim_start_matches('/');
            if k.is_empty() {
                continue;
            }
            let resolved = if k.contains("://") {
                let Some(r) = store.extract_object_key(k).filter(|s| !s.is_empty()) else {
                    continue;
                };
                r
            } else {
                k.to_string()
            };
            if seen.insert(resolved.clone()) {
                out.push(resolved);
            }
        }
    }
    out
}

fn tos_from_settings(s: &StorageSettings) -> Option<TosConfig> {
    if s.tos_access_key.trim().is_empty()
        || s.tos_secret_key.trim().is_empty()
        || s.tos_endpoint.trim().is_empty()
        || s.tos_region.trim().is_empty()
        || s.tos_bucket.trim().is_empty()
    {
        return None;
    }
    Some(TosConfig {
        access_key: s.tos_access_key.trim().to_string(),
        secret_key: s.tos_secret_key.trim().to_string(),
        endpoint: s.tos_endpoint.trim().to_string(),
        region: s.tos_region.trim().to_string(),
        bucket: s.tos_bucket.trim().to_string(),
        path_prefix: s.tos_path_prefix.trim().to_string(),
        custom_domain: s.tos_custom_domain.trim().to_string(),
    })
}
