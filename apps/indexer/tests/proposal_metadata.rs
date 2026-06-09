use anyhow::anyhow;
use degov_datalens_indexer::{
    ProposalTitleExtractor, derive_proposal_metadata, derive_proposal_metadata_with_title_extractor,
};

struct StaticTitleExtractor {
    title: Option<String>,
}

impl ProposalTitleExtractor for StaticTitleExtractor {
    fn extract_title(&self, _description: &str) -> anyhow::Result<Option<String>> {
        Ok(self.title.clone())
    }
}

struct DisabledTitleExtractor;

impl ProposalTitleExtractor for DisabledTitleExtractor {
    fn extract_title(&self, _description: &str) -> anyhow::Result<Option<String>> {
        Ok(None)
    }
}

struct FailingTitleExtractor;

impl ProposalTitleExtractor for FailingTitleExtractor {
    fn extract_title(&self, _description: &str) -> anyhow::Result<Option<String>> {
        Err(anyhow!("provider unavailable"))
    }
}

fn derive_proposal_metadata_without_ai(
    description: &str,
) -> degov_datalens_indexer::ProposalTextMetadata {
    derive_proposal_metadata_with_title_extractor(description, &DisabledTitleExtractor)
}

#[test]
fn test_derive_proposal_metadata_preserves_raw_description_and_hashes_utf8_bytes() {
    let description = "# Proposal title\n\nProposal body";

    let metadata = derive_proposal_metadata_without_ai(description);

    assert_eq!(metadata.description, description);
    assert_eq!(metadata.title, "Proposal title");
    assert_eq!(metadata.description_body, "Proposal body");
    assert_eq!(
        metadata.description_hash,
        "0x3bec3dfa58e028fdf10e56bebf69d18a3170b2897a2381164179670dd2fa0193"
    );
}

#[test]
fn test_derive_proposal_metadata_applies_stable_title_fallback_rules() {
    let html_heading = derive_proposal_metadata_without_ai("# <span>Upgrade treasury</span>\nBody");
    let numeric_heading = derive_proposal_metadata_without_ai("# 1 1\nBody");
    let fallback = derive_proposal_metadata_without_ai(
        "<b>Plain proposal title that is definitely longer than fifty characters</b>\nBody",
    );

    assert_eq!(html_heading.title, "<span>Upgrade treasury</span>");
    assert_eq!(html_heading.description_body, "Body");
    assert_eq!(numeric_heading.title, "1 1");
    assert_eq!(numeric_heading.description_body, "Body");
    assert_eq!(
        fallback.title,
        "Plain proposal title that is definitely longer tha..."
    );
    assert_eq!(fallback.description_body, "Body");
}

#[test]
fn test_derive_proposal_metadata_preserves_textplus_fallback_compatibility() {
    let nested_heading = derive_proposal_metadata_without_ai("Intro\n# Real title\nBody");
    let list_marker = derive_proposal_metadata_without_ai("- Proposal title\nBody");
    let markdown_link =
        derive_proposal_metadata_without_ai("[Proposal title](https://example.com)\nBody");
    let blockquote = derive_proposal_metadata_without_ai("> Proposal title\nBody");
    let compact_heading = derive_proposal_metadata_without_ai("#Title\nBody");
    let nested_hash_heading = derive_proposal_metadata_without_ai("## Title\nBody");
    let indented_heading = derive_proposal_metadata_without_ai("  # Title\nBody");

    assert_eq!(nested_heading.title, "Real title");
    assert_eq!(nested_heading.description_body, "Intro\n# Real title\nBody");
    assert_eq!(list_marker.title, "Proposal title");
    assert_eq!(list_marker.description_body, "Body");
    assert_eq!(markdown_link.title, "Proposal title");
    assert_eq!(markdown_link.description_body, "Body");
    assert_eq!(blockquote.title, "Proposal title");
    assert_eq!(blockquote.description_body, "Body");
    assert_eq!(compact_heading.title, "#Title");
    assert_eq!(compact_heading.description_body, "Body");
    assert_eq!(nested_hash_heading.title, "Title");
    assert_eq!(nested_hash_heading.description_body, "Body");
    assert_eq!(indented_heading.title, "Title");
    assert_eq!(indented_heading.description_body, "Body");
}

#[test]
fn test_derive_proposal_metadata_extracts_deterministic_description_tags() {
    let metadata = derive_proposal_metadata_without_ai(
        "# Title\n\nMain text\n\n<discussion>https://forum.example/proposal</discussion>\n\n<signature>[\"transfer(address,uint256)\",\"\"]</signature>",
    );

    assert_eq!(metadata.title, "Title");
    assert_eq!(metadata.description_body, "Main text");
    assert_eq!(
        metadata.discussion.as_deref(),
        Some("https://forum.example/proposal")
    );
    assert_eq!(
        metadata.signature_content,
        vec!["transfer(address,uint256)".to_owned(), String::new()]
    );
}

#[test]
fn test_derive_proposal_metadata_is_deterministic_without_provider_configuration() {
    temp_env::with_vars(
        [
            ("OPENROUTER_API_KEY", None::<&str>),
            ("TEXTPLUS_API_KEY", None::<&str>),
            ("OPENAI_API_KEY", None::<&str>),
        ],
        || {
            let first = derive_proposal_metadata("# Title\n\nBody");
            let second = derive_proposal_metadata("# Title\n\nBody");

            assert_eq!(first, second);
        },
    );
}

#[test]
fn test_derive_proposal_metadata_uses_local_fallback_when_ai_is_disabled() {
    temp_env::with_vars([("OPENROUTER_API_KEY", None::<&str>)], || {
        let metadata = derive_proposal_metadata("[Proposal title](https://example.com)\nBody");

        assert_eq!(metadata.title, "Proposal title");
        assert_eq!(metadata.description_body, "Body");
    });
}

#[test]
fn test_derive_proposal_metadata_uses_ai_title_when_provider_returns_title() {
    let metadata = derive_proposal_metadata_with_title_extractor(
        "# Local title\nBody",
        &StaticTitleExtractor {
            title: Some("AI title".to_owned()),
        },
    );

    assert_eq!(metadata.title, "AI title");
    assert_eq!(metadata.description_body, "Body");
}

#[test]
fn test_derive_proposal_metadata_falls_back_when_ai_fails_or_returns_empty_title() {
    let failure_metadata = derive_proposal_metadata_with_title_extractor(
        "# Local title\nBody",
        &FailingTitleExtractor,
    );
    let empty_metadata = derive_proposal_metadata_with_title_extractor(
        "# Local title\nBody",
        &StaticTitleExtractor {
            title: Some("  ".to_owned()),
        },
    );

    assert_eq!(failure_metadata.title, "Local title");
    assert_eq!(failure_metadata.description_body, "Body");
    assert_eq!(empty_metadata.title, "Local title");
    assert_eq!(empty_metadata.description_body, "Body");
}
