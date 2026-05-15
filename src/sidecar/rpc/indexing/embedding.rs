use serde_json::Value;

pub fn build_embedding_text(summary: &Value) -> String {
    let mut parts = Vec::new();

    let add_part = |parts: &mut Vec<String>, label: &str, value: String| {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            parts.push(format!("{}: {}", label, trimmed));
        }
    };

    if let Some(text) = summary.get("summary").and_then(Value::as_str) {
        add_part(&mut parts, "summary", text.to_string());
    }

    if let Some(items) = summary.get("objects").and_then(Value::as_array) {
        let joined = items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<&str>>()
            .join(", ");
        add_part(&mut parts, "objects", joined);
    }

    if let Some(items) = summary.get("actions").and_then(Value::as_array) {
        let joined = items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<&str>>()
            .join(", ");
        add_part(&mut parts, "actions", joined);
    }

    if let Some(text) = summary.get("setting").and_then(Value::as_str) {
        add_part(&mut parts, "setting", text.to_string());
    }

    if let Some(text) = summary.get("ocr").and_then(Value::as_str) {
        add_part(&mut parts, "ocr", text.to_string());
    }

    if let Some(text) = summary.get("quality").and_then(Value::as_str) {
        add_part(&mut parts, "quality", text.to_string());
    }

    parts.join(" | ")
}
