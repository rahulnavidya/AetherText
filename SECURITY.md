# Security policy

AetherText is a local-first editor that can render user-authored HTML, CSS, SVG, and—only after a per-document opt-in—JavaScript. Imported or opened content should be treated as untrusted.

## Reporting a vulnerability

Please do not publish exploit details in a public issue. If GitHub private vulnerability reporting is enabled for the repository, use it to send a private report. Otherwise, contact the repository maintainer privately before publishing technical details.

## Security-sensitive areas

- Preview iframe sandbox and CSP
- Per-document JavaScript opt-in and script/event-handler filtering
- SVG sanitization
- Markdown URL/HTML handling
- Imported asset type/size handling
- IndexedDB workspace and history recovery
- Standalone HTML export, especially when scripts are enabled

Security fixes should include a regression test. Avoid enabling `allow-same-origin`, top navigation, forms, or native bridges for previewed documents without a threat-model review.
