/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct AdminGroupPermissionPolicy {
    #[serde(default)]
    pub view: Vec<String>,
    #[serde(default)]
    pub edit: Vec<String>,
}

impl AdminGroupPermissionPolicy {
    pub fn parse(raw: Option<&str>) -> Self {
        let Some(text) = raw.filter(|s| !s.trim().is_empty()) else {
            return Self::default();
        };
        if let Ok(policy) = serde_json::from_str::<Self>(text) {
            if !policy.view.is_empty() || text.contains("\"view\"") {
                return policy.normalized();
            }
        }
        if let Ok(keys) = serde_json::from_str::<Vec<String>>(text) {
            return Self {
                view: keys.clone(),
                edit: keys,
            };
        }
        Self::default()
    }

    pub fn from_view_and_edit(view: Vec<String>, edit: Option<Vec<String>>) -> Self {
        let edit = edit.unwrap_or_else(|| view.clone());
        Self { view, edit }.normalized()
    }

    pub fn normalized(mut self) -> Self {
        self.view.sort();
        self.view.dedup();
        self.edit.retain(|k| self.view.contains(k));
        self.edit.sort();
        self.edit.dedup();
        self
    }

    pub fn to_json_string(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

fn has_dotted_child(granted: &[String], parent: &str) -> bool {
    granted.iter().any(|g| {
        g.len() > parent.len() && g.starts_with(parent) && g.as_bytes()[parent.len()] == b'.'
    })
}

/// 精确匹配。授权里已有 `parent.*` 时，一级 key 不再覆盖未列出的子项。
pub fn permission_key_allowed(granted: &[String], required: &str) -> bool {
    if required.is_empty() {
        return false;
    }
    if granted.iter().any(|g| g == required) {
        return true;
    }
    if let Some((parent, _)) = required.split_once('.') {
        !has_dotted_child(granted, parent) && granted.iter().any(|g| g == parent)
    } else {
        has_dotted_child(granted, required)
    }
}
