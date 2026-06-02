use sha3::{Digest, Keccak256};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalTextMetadata {
    pub description: String,
    pub title: String,
    pub description_body: String,
    pub description_hash: String,
    pub discussion: Option<String>,
    pub signature_content: Vec<String>,
}

pub fn derive_proposal_metadata(description: &str) -> ProposalTextMetadata {
    let (title, description_body) = extract_title_and_body(description);
    let (description_body, discussion, signature_content) =
        extract_description_tags(&description_body);

    ProposalTextMetadata {
        description: description.to_owned(),
        title,
        description_body,
        description_hash: description_hash(description),
        discussion,
        signature_content,
    }
}

fn extract_title_and_body(description: &str) -> (String, String) {
    if let Some(rest) = description.strip_prefix('#') {
        let Some(rest) = strip_heading_space(rest) else {
            return fallback_title_and_body(description);
        };
        let mut parts = rest.splitn(2, '\n');
        let raw_title = parts.next().unwrap_or_default();
        let title = normalize_heading_title(raw_title);
        let body = parts.next().unwrap_or_default().trim().to_owned();
        return (title, body);
    }

    fallback_title_and_body(description)
}

fn strip_heading_space(value: &str) -> Option<&str> {
    let trimmed = value.trim_start_matches(char::is_whitespace);
    if trimmed.len() == value.len() {
        return None;
    }
    Some(trimmed)
}

fn normalize_heading_title(value: &str) -> String {
    let clean_title = strip_html_tags(value).trim().to_owned();
    if clean_title
        .chars()
        .all(|character| character.is_ascii_digit() || character.is_whitespace())
    {
        return clean_title
            .split_whitespace()
            .next()
            .unwrap_or(clean_title.as_str())
            .to_owned();
    }

    clean_title
}

fn fallback_title_and_body(description: &str) -> (String, String) {
    let trimmed = description.trim();
    let mut lines = trimmed.lines();
    let fallback_title = strip_html_tags(lines.next().unwrap_or_default())
        .trim()
        .to_owned();
    let title = if fallback_title.len() > 50 {
        format!("{}...", fallback_title.chars().take(50).collect::<String>())
    } else {
        fallback_title
    };
    let body = lines.collect::<Vec<_>>().join("\n").trim().to_owned();

    (title, body)
}

fn extract_description_tags(description: &str) -> (String, Option<String>, Vec<String>) {
    let mut description = description.to_owned();
    let mut discussion = None;
    let mut signature_raw = None;

    if let Some((remaining, value)) = extract_single_tag(&description, "discussion") {
        description = remaining;
        discussion = Some(value);
    }
    if let Some((remaining, value)) = extract_single_tag(&description, "signature") {
        description = remaining;
        signature_raw = Some(value);
    }
    let signature_content = signature_raw
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default();

    (description.trim().to_owned(), discussion, signature_content)
}

fn extract_single_tag(description: &str, tag: &str) -> Option<(String, String)> {
    let open_tag = format!("<{tag}>");
    let close_tag = format!("</{tag}>");
    let start = description.find(&open_tag)?;
    let content_start = start + open_tag.len();
    let content_end = description[content_start..].find(&close_tag)? + content_start;
    let content = description[content_start..content_end].trim().to_owned();
    let mut remaining = String::with_capacity(description.len());
    remaining.push_str(&description[..start]);
    remaining.push_str(&description[content_end + close_tag.len()..]);

    Some((remaining.trim().to_owned(), content))
}

fn strip_html_tags(value: &str) -> String {
    let mut stripped = String::with_capacity(value.len());
    let mut in_tag = false;

    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => stripped.push(character),
            _ => {}
        }
    }

    stripped
}

fn description_hash(description: &str) -> String {
    let hash = Keccak256::digest(description.as_bytes());
    format!("0x{}", hex::encode(hash))
}
