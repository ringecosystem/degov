use serde::Deserialize;
use serde_json::json;
use sha3::{Digest, Keccak256};
use std::time::Duration;

const OPENROUTER_CHAT_COMPLETIONS_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL: &str = "google/gemini-2.5-flash-preview";

pub trait ProposalTitleExtractor {
    fn extract_title(
        &self,
        description: &str,
    ) -> Result<Option<String>, ProposalTitleExtractionError>;
}

#[derive(Debug, thiserror::Error)]
pub enum ProposalTitleExtractionError {
    #[error("send OpenRouter title extraction request")]
    SendRequest(#[source] reqwest::Error),
    #[error("OpenRouter title extraction response status")]
    ResponseStatus(#[source] reqwest::Error),
    #[error("decode OpenRouter title extraction response")]
    DecodeResponse(#[source] reqwest::Error),
    #[error("decode OpenRouter title JSON content: {content}")]
    DecodeTitleJson {
        content: String,
        #[source]
        source: serde_json::Error,
    },
}

pub struct OpenRouterProposalTitleExtractor {
    api_key: String,
    model: String,
    http: reqwest::blocking::Client,
}

impl OpenRouterProposalTitleExtractor {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("OPENROUTER_API_KEY")
            .ok()
            .filter(|value| !value.trim().is_empty())?;
        let model = std::env::var("OPENROUTER_DEFAULT_MODEL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| OPENROUTER_DEFAULT_MODEL.to_owned());
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_else(|error| {
                log::warn!("openrouter client build failed; using default client: {error}");
                reqwest::blocking::Client::new()
            });

        Some(Self {
            api_key,
            model,
            http,
        })
    }
}

impl ProposalTitleExtractor for OpenRouterProposalTitleExtractor {
    fn extract_title(
        &self,
        description: &str,
    ) -> Result<Option<String>, ProposalTitleExtractionError> {
        let request_body = openrouter_title_request_body(&self.model, description);
        let response = self
            .http
            .post(OPENROUTER_CHAT_COMPLETIONS_URL)
            .bearer_auth(&self.api_key)
            .json(&request_body)
            .send()
            .map_err(ProposalTitleExtractionError::SendRequest)?
            .error_for_status()
            .map_err(ProposalTitleExtractionError::ResponseStatus)?
            .json::<OpenRouterChatCompletionResponse>()
            .map_err(ProposalTitleExtractionError::DecodeResponse)?;

        let Some(content) = response
            .choices
            .first()
            .map(|choice| choice.message.content.trim())
            .filter(|content| !content.is_empty())
        else {
            return Ok(None);
        };
        let parsed = serde_json::from_str::<OpenRouterTitleObject>(content).map_err(|source| {
            ProposalTitleExtractionError::DecodeTitleJson {
                content: content.to_owned(),
                source,
            }
        })?;
        let title = parsed.title.trim();

        if title.is_empty() {
            Ok(None)
        } else {
            Ok(Some(title.to_owned()))
        }
    }
}

fn openrouter_title_request_body(model: &str, description: &str) -> serde_json::Value {
    json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": r#"
## Role
You are an experienced Content Strategist and master Copywriter, skilled at distilling complex information into captivating titles that reflect the core message. Your objective is to generate the required titles for the content provided.

## Task
Based on the provided "Original Content" and "Specific Requirements," extract and generate a professional title.
And you must return the content in pure JSON format as required.

## Basic Requirements

- The title must contain the core theme.
- The title will be used for: A blog post.
- If the user provides specific requirements, they take precedence.
- The returned content must be a raw JSON string.
- If the original content does not specify a date, do not include year, month, or day information in the title to avoid inaccuracies and prevent misleading the reader.

## Output Format

Return a single JSON object with these fields:

{
  "title": "string"
}
"#
            },
            {
                "role": "user",
                "content": format!(r#"
{description}
---
Extract a title from the content above, following these rules in order:

1. **Priority 1**: Extract the first H1 heading (e.g., `<h1>...</h1>` or `# ...`) from the content.
2. **Priority 2**: If no H1 heading exists, use the first line of the content, provided it effectively summarizes the main topic.
3. **Priority 3**: If both of the above methods fail, generate a concise title by summarizing the content.
"#)
            }
        ],
        "response_format": {
            "type": "json_object"
        }
    })
}

#[derive(Deserialize)]
struct OpenRouterChatCompletionResponse {
    choices: Vec<OpenRouterChatCompletionChoice>,
}

#[derive(Deserialize)]
struct OpenRouterChatCompletionChoice {
    message: OpenRouterChatCompletionMessage,
}

#[derive(Deserialize)]
struct OpenRouterChatCompletionMessage {
    content: String,
}

#[derive(Deserialize)]
struct OpenRouterTitleObject {
    title: String,
}

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
    if let Some(title_extractor) = OpenRouterProposalTitleExtractor::from_env() {
        derive_proposal_metadata_with_title_extractor(description, &title_extractor)
    } else {
        derive_proposal_metadata_without_title_extractor(description)
    }
}

pub fn derive_proposal_metadata_with_title_extractor(
    description: &str,
    title_extractor: &dyn ProposalTitleExtractor,
) -> ProposalTextMetadata {
    let (local_title, description_body) = extract_title_and_body(description);
    let title = if description.trim().is_empty() {
        local_title
    } else {
        extract_ai_title(title_extractor, description).unwrap_or(local_title)
    };
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

fn derive_proposal_metadata_without_title_extractor(description: &str) -> ProposalTextMetadata {
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

fn extract_ai_title(
    title_extractor: &dyn ProposalTitleExtractor,
    description: &str,
) -> Option<String> {
    match title_extractor.extract_title(description) {
        Ok(Some(title)) if !title.trim().is_empty() => Some(title.trim().to_owned()),
        Ok(_) => None,
        Err(error) => {
            log::warn!("textplus.title generation failed; falling back to local: {error}");
            None
        }
    }
}

fn extract_title_and_body(description: &str) -> (String, String) {
    let trimmed = description.trim();
    let title = extract_title_simplify(trimmed).unwrap_or_else(|| extract_title_fullback(trimmed));
    let body = extract_description_body(trimmed, &title);

    (title, body)
}

fn extract_title_simplify(description: &str) -> Option<String> {
    if description.trim().is_empty() {
        return None;
    }

    description.lines().find_map(|line| {
        let trimmed = line.trim_start();
        let heading = trimmed.strip_prefix('#')?;
        if !starts_with_whitespace(heading) {
            return None;
        }
        let title = heading.trim();
        if title.is_empty() {
            None
        } else {
            Some(title.to_owned())
        }
    })
}

fn extract_title_fullback(description: &str) -> String {
    if description.trim().is_empty() {
        return String::new();
    }

    let mut clean_text = String::with_capacity(description.len());
    for line in strip_markdown_links(&strip_html_tags(description)).lines() {
        let clean_line = clean_fullback_line(line);
        clean_text.push_str(&clean_line);
        clean_text.push('\n');
    }

    let first_line = clean_text
        .trim()
        .lines()
        .next()
        .unwrap_or_default()
        .trim()
        .to_owned();

    truncate_title(&first_line)
}

fn clean_fullback_line(line: &str) -> String {
    let without_prefix = strip_heading_prefix(line)
        .or_else(|| strip_line_prefix(line, '-'))
        .or_else(|| strip_line_prefix(line, '*'))
        .or_else(|| strip_line_prefix(line, '+'))
        .unwrap_or(line);
    let without_rule = if is_horizontal_rule(without_prefix) {
        ""
    } else {
        without_prefix
    };

    normalize_bracket_prefix(strip_blockquote_prefix(without_rule))
}

fn normalize_bracket_prefix(line: &str) -> String {
    let trimmed = line.trim_start();
    let Some(rest) = trimmed.strip_prefix('[') else {
        return line.to_owned();
    };
    let Some(close_index) = rest.find(']') else {
        return line.to_owned();
    };
    let label = rest[..close_index].trim();
    let suffix = rest[close_index + 1..].trim_start();
    if label.is_empty() || suffix.is_empty() {
        return line.to_owned();
    }

    format!("{label}: {suffix}")
}

fn strip_heading_prefix(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    let rest = trimmed.trim_start_matches('#');
    if rest == trimmed || !starts_with_whitespace(rest) {
        return None;
    }

    Some(rest.trim_start())
}

fn strip_line_prefix(line: &str, marker: char) -> Option<&str> {
    let trimmed = line.trim_start();
    let rest = trimmed.strip_prefix(marker)?;
    if !starts_with_whitespace(rest) {
        return None;
    }

    Some(rest.trim_start())
}

fn strip_blockquote_prefix(line: &str) -> &str {
    let trimmed = line.trim_start();
    let Some(rest) = trimmed.strip_prefix('>') else {
        return line;
    };

    rest.trim_start()
}

fn starts_with_whitespace(value: &str) -> bool {
    value
        .chars()
        .next()
        .is_some_and(|character| character.is_whitespace())
}

fn is_horizontal_rule(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.len() >= 3
        && trimmed
            .chars()
            .all(|character| matches!(character, '-' | '*' | '_'))
}

fn strip_markdown_links(value: &str) -> String {
    let mut stripped = String::with_capacity(value.len());
    let mut remaining = value;

    while let Some(open_bracket) = remaining.find('[') {
        stripped.push_str(&remaining[..open_bracket]);
        let image_prefix = open_bracket > 0 && remaining[..open_bracket].ends_with('!');
        if image_prefix {
            stripped.pop();
        }
        let label_start = open_bracket + 1;
        let Some(label_end_offset) = remaining[label_start..].find(']') else {
            stripped.push_str(&remaining[open_bracket..]);
            return stripped;
        };
        let label_end = label_start + label_end_offset;
        let after_label = label_end + 1;
        if !remaining[after_label..].starts_with('(') {
            stripped.push_str(&remaining[open_bracket..after_label]);
            remaining = &remaining[after_label..];
            continue;
        }
        let url_start = after_label + 1;
        let Some(url_end_offset) = remaining[url_start..].find(')') else {
            stripped.push_str(&remaining[open_bracket..]);
            return stripped;
        };
        let url_end = url_start + url_end_offset;

        stripped.push_str(&remaining[label_start..label_end]);
        remaining = &remaining[url_end + 1..];
    }

    stripped.push_str(remaining);
    stripped
}

fn truncate_title(title: &str) -> String {
    const MAX_LENGTH: usize = 50;

    if title.chars().count() > MAX_LENGTH {
        format!("{}...", title.chars().take(MAX_LENGTH).collect::<String>())
    } else {
        title.to_owned()
    }
}

fn extract_description_body(description: &str, title: &str) -> String {
    if let Some((first_line, body)) = description.split_once('\n') {
        let first_line_title = extract_title_simplify(first_line)
            .unwrap_or_else(|| extract_title_fullback(first_line.trim()));
        if first_line_title == title {
            return body.trim().to_owned();
        }
    }

    description.to_owned()
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

#[cfg(test)]
mod tests {
    use super::*;

    struct StaticTitleExtractor;

    impl ProposalTitleExtractor for StaticTitleExtractor {
        fn extract_title(
            &self,
            _description: &str,
        ) -> Result<Option<String>, ProposalTitleExtractionError> {
            Ok(Some("AI title".to_owned()))
        }
    }

    #[test]
    fn test_title_extractor_runs_when_local_fallback_is_empty() {
        let metadata = derive_proposal_metadata_with_title_extractor("<br>", &StaticTitleExtractor);

        assert_eq!(metadata.title, "AI title");
    }

    #[test]
    fn test_openrouter_title_request_uses_legacy_textplus_prompt_shape() {
        let body = openrouter_title_request_body("test-model", "# Local title\n\nBody");
        let messages = body["messages"].as_array().expect("messages");

        let system = messages[0]["content"].as_str().expect("system content");
        let prompt = messages[1]["content"].as_str().expect("user content");

        assert!(system.contains("## Role"));
        assert!(system.contains("The title must contain the core theme."));
        assert!(system.contains("The title will be used for: A blog post."));
        assert!(system.contains("Return a single JSON object with these fields:"));
        assert!(prompt.contains("# Local title\n\nBody"));
        assert!(prompt.contains("1. **Priority 1**"));
        assert!(prompt.contains("`<h1>...</h1>` or `# ...`"));
    }
}

fn description_hash(description: &str) -> String {
    let hash = Keccak256::digest(description.as_bytes());
    format!("0x{}", hex::encode(hash))
}
