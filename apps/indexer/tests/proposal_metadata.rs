use degov_datalens_indexer::derive_proposal_metadata;

#[test]
fn test_derive_proposal_metadata_preserves_raw_description_and_hashes_utf8_bytes() {
    let description = "# Proposal title\n\nProposal body";

    let metadata = derive_proposal_metadata(description);

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
    let html_heading = derive_proposal_metadata("# <span>Upgrade treasury</span>\nBody");
    let numeric_heading = derive_proposal_metadata("# 1 1\nBody");
    let fallback = derive_proposal_metadata(
        "<b>Plain proposal title that is definitely longer than fifty characters</b>\nBody",
    );

    assert_eq!(html_heading.title, "Upgrade treasury");
    assert_eq!(html_heading.description_body, "Body");
    assert_eq!(numeric_heading.title, "1");
    assert_eq!(numeric_heading.description_body, "Body");
    assert_eq!(
        fallback.title,
        "Plain proposal title that is definitely longer tha..."
    );
    assert_eq!(fallback.description_body, "Body");
}

#[test]
fn test_derive_proposal_metadata_preserves_legacy_hash_fallback_titles() {
    let compact_heading = derive_proposal_metadata("#Title\nBody");
    let nested_heading = derive_proposal_metadata("## Title\nBody");
    let indented_heading = derive_proposal_metadata("  # Title\nBody");

    assert_eq!(compact_heading.title, "Title");
    assert_eq!(compact_heading.description_body, "Body");
    assert_eq!(nested_heading.title, "Title");
    assert_eq!(nested_heading.description_body, "Body");
    assert_eq!(indented_heading.title, "Title");
    assert_eq!(indented_heading.description_body, "Body");
}

#[test]
fn test_derive_proposal_metadata_extracts_deterministic_description_tags() {
    let metadata = derive_proposal_metadata(
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
