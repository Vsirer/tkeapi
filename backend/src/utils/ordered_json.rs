/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use std::fmt;

/// 通用有序 JSON 数据结构
/// 专门解决第三方 API（如火山引擎格式组装、支付回调验签等）对 JSON 字段顺序敏感的问题
/// 避免在 Cargo.toml 开启全局 preserve_order 带来的编译拖慢与包体积膨胀
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum OrderedJson {
    Null,
    Bool(bool),
    Number(serde_json::Number),
    String(String),
    Array(Vec<OrderedJson>),
    Object(Vec<(String, OrderedJson)>), // 使用有序键值对列表保留自然出现顺序
}

#[allow(dead_code)]
impl OrderedJson {
    /// 创建空的有序 Object
    pub fn object() -> Self {
        OrderedJson::Object(Vec::new())
    }

    /// 创建空的 Array
    pub fn array() -> Self {
        OrderedJson::Array(Vec::new())
    }

    /// 设置/追加键值对（保持添加顺序，若键已存在则就地更新）
    pub fn set<V: Into<OrderedJson>>(mut self, key: impl Into<String>, value: V) -> Self {
        let key = key.into();
        let value = value.into();
        if let OrderedJson::Object(ref mut entries) = self {
            if let Some(item) = entries.iter_mut().find(|(k, _)| k == &key) {
                item.1 = value;
            } else {
                entries.push((key, value));
            }
        }
        self
    }

    /// 提取指定 key 的子节点引用
    pub fn get(&self, key: &str) -> Option<&OrderedJson> {
        match self {
            OrderedJson::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// 若包含名为 "data" 且为 Object 的子节点，则返回该 data 节点，否则返回自身引用
    pub fn data_or_self(&self) -> &OrderedJson {
        if let Some(data @ OrderedJson::Object(_)) = self.get("data") {
            data
        } else {
            self
        }
    }

    /// 递归拼接所有叶子节点的值（不含 key，不含拼接符，严格保持各层级字段原始自然顺序）
    pub fn flatten_leaf_values(&self) -> String {
        match self {
            OrderedJson::Null => String::new(),
            OrderedJson::Bool(b) => b.to_string(),
            OrderedJson::Number(n) => n.to_string(),
            OrderedJson::String(s) => s.clone(),
            OrderedJson::Array(arr) => arr.iter().map(|item| item.flatten_leaf_values()).collect(),
            OrderedJson::Object(entries) => entries
                .iter()
                .map(|(_, val)| val.flatten_leaf_values())
                .collect(),
        }
    }

    /// 按照第三方 API（如支付回调、云厂商鉴权）常见规范生成待签名串：
    /// - `sort_top_keys`: 顶层 key 是否按 ASCII 字典序排序（如 HyperBC 需要，而某些严格保序接口不需要）
    /// - `filter_null`: 是否过滤 null 值
    /// - `exclude_keys`: 需要排除的 key 列表（如 ["sign", "signature"]）
    pub fn to_sign_query(
        &self,
        sort_top_keys: bool,
        filter_null: bool,
        exclude_keys: &[&str],
    ) -> String {
        let entries = match self {
            OrderedJson::Object(entries) => entries,
            _ => return self.flatten_leaf_values(),
        };

        let mut filtered: Vec<&(String, OrderedJson)> = entries
            .iter()
            .filter(|(k, v)| {
                !exclude_keys.contains(&k.as_str())
                    && (!filter_null || !matches!(v, OrderedJson::Null))
            })
            .collect();

        if sort_top_keys {
            filtered.sort_by(|a, b| a.0.cmp(&b.0));
        }

        filtered
            .into_iter()
            .map(|(k, v)| format!("{}={}", k, v.flatten_leaf_values()))
            .collect::<Vec<_>>()
            .join("&")
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            OrderedJson::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn is_null(&self) -> bool {
        matches!(self, OrderedJson::Null)
    }
}

// ================= Serde Visitor: 保序反序列化 =================

struct OrderedJsonVisitor;

impl<'de> serde::de::Visitor<'de> for OrderedJsonVisitor {
    type Value = OrderedJson;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("any valid JSON value")
    }

    fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E> {
        Ok(OrderedJson::Bool(v))
    }

    fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
        Ok(OrderedJson::Number(serde_json::Number::from(v)))
    }

    fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
        Ok(OrderedJson::Number(serde_json::Number::from(v)))
    }

    fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E> {
        Ok(serde_json::Number::from_f64(v)
            .map(OrderedJson::Number)
            .unwrap_or(OrderedJson::Null))
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> {
        Ok(OrderedJson::String(v.to_string()))
    }

    fn visit_string<E>(self, v: String) -> Result<Self::Value, E> {
        Ok(OrderedJson::String(v))
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(OrderedJson::Null)
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        serde::Deserialize::deserialize(deserializer)
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(OrderedJson::Null)
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::SeqAccess<'de>,
    {
        let mut list = Vec::new();
        while let Some(elem) = seq.next_element()? {
            list.push(elem);
        }
        Ok(OrderedJson::Array(list))
    }

    fn visit_map<M>(self, mut access: M) -> Result<Self::Value, M::Error>
    where
        M: serde::de::MapAccess<'de>,
    {
        let mut entries = Vec::new();
        while let Some(entry) = access.next_entry()? {
            entries.push(entry);
        }
        Ok(OrderedJson::Object(entries))
    }
}

impl<'de> serde::Deserialize<'de> for OrderedJson {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(OrderedJsonVisitor)
    }
}

// ================= Serde Serialize: 保序序列化 =================

impl serde::Serialize for OrderedJson {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::{SerializeMap, SerializeSeq};
        match self {
            OrderedJson::Null => serializer.serialize_unit(),
            OrderedJson::Bool(b) => serializer.serialize_bool(*b),
            OrderedJson::Number(n) => n.serialize(serializer),
            OrderedJson::String(s) => serializer.serialize_str(s),
            OrderedJson::Array(arr) => {
                let mut seq = serializer.serialize_seq(Some(arr.len()))?;
                for item in arr {
                    seq.serialize_element(item)?;
                }
                seq.end()
            }
            OrderedJson::Object(entries) => {
                let mut map = serializer.serialize_map(Some(entries.len()))?;
                for (k, v) in entries {
                    map.serialize_entry(k, v)?;
                }
                map.end()
            }
        }
    }
}

// ================= From 基础类型与 Value 互转 =================

impl From<&str> for OrderedJson {
    fn from(s: &str) -> Self {
        OrderedJson::String(s.to_string())
    }
}

impl From<String> for OrderedJson {
    fn from(s: String) -> Self {
        OrderedJson::String(s)
    }
}

impl From<bool> for OrderedJson {
    fn from(b: bool) -> Self {
        OrderedJson::Bool(b)
    }
}

impl From<i64> for OrderedJson {
    fn from(n: i64) -> Self {
        OrderedJson::Number(serde_json::Number::from(n))
    }
}

impl From<f64> for OrderedJson {
    fn from(n: f64) -> Self {
        serde_json::Number::from_f64(n)
            .map(OrderedJson::Number)
            .unwrap_or(OrderedJson::Null)
    }
}

impl From<serde_json::Value> for OrderedJson {
    fn from(val: serde_json::Value) -> Self {
        match val {
            serde_json::Value::Null => OrderedJson::Null,
            serde_json::Value::Bool(b) => OrderedJson::Bool(b),
            serde_json::Value::Number(n) => OrderedJson::Number(n),
            serde_json::Value::String(s) => OrderedJson::String(s),
            serde_json::Value::Array(arr) => {
                OrderedJson::Array(arr.into_iter().map(OrderedJson::from).collect())
            }
            serde_json::Value::Object(map) => OrderedJson::Object(
                map.into_iter()
                    .map(|(k, v)| (k, OrderedJson::from(v)))
                    .collect(),
            ),
        }
    }
}

impl From<OrderedJson> for serde_json::Value {
    fn from(val: OrderedJson) -> Self {
        match val {
            OrderedJson::Null => serde_json::Value::Null,
            OrderedJson::Bool(b) => serde_json::Value::Bool(b),
            OrderedJson::Number(n) => serde_json::Value::Number(n),
            OrderedJson::String(s) => serde_json::Value::String(s),
            OrderedJson::Array(arr) => {
                serde_json::Value::Array(arr.into_iter().map(serde_json::Value::from).collect())
            }
            OrderedJson::Object(entries) => {
                let map = entries
                    .into_iter()
                    .map(|(k, v)| (k, serde_json::Value::from(v)))
                    .collect();
                serde_json::Value::Object(map)
            }
        }
    }
}
