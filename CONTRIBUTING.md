# Contributing to AetherText

Thanks for helping improve AetherText. The priorities are correctness, safety, accessibility, and a small runtime footprint.

## Development principles

- Keep the app browser-native: HTML, CSS, and ES modules. Do not add React/Vue/Angular, a build pipeline, or a runtime dependency without discussing the trade-off first.
- Preserve local-first storage and the workspace/history migration behavior. Never read or transmit drafts, font lists, or imported files unless a clearly documented user action requires it.
- Treat previewed content as untrusted. Keep document scripts opt-in and sandboxed; use text nodes or escaping for untrusted source; do not weaken CSP/sandbox settings casually.
- Keep file-type behavior explicit. Source formats should remain inert, while browser/data/asset previews should have clear size limits and fallbacks.
- Keep theme/accessibility behavior consistent: keyboard-visible focus, reduced-motion support, readable contrast, and persisted preferences.

## Before opening a pull request

1. Run `npm test` with Node.js 22 or newer.
2. Run `node --check` for every root JavaScript module.
3. Test the changed feature manually from `localhost` or HTTPS, including the affected file type(s), keyboard interaction, reload recovery, and offline behavior where relevant.
4. Update README/CHANGELOG/release notes when behavior or supported formats change.
5. Do not commit user documents, font binaries, browser exports, private `.env` files, credentials, or generated archives.

The test suite uses Node's built-in test runner; the app itself has no npm dependencies.
