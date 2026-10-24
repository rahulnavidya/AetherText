# AetherText v2.0.0

A local-first, no-build text and Markdown workspace that can also edit HTML, CSS, JavaScript, data files, configuration, and other text formats. Built with plain HTML, CSS, and native ES modules—no frontend framework, account, analytics, build pipeline, or app-runtime dependency.

> **Release status:** This repository is a browser/PWA release. It includes tests and a GitHub Pages workflow. It is not yet an Android package and cannot be submitted directly to F-Droid without an Android application wrapper/project and the associated build/release work; see [F-Droid preparation](F-DROID_PREPARATION.md).

## Run locally

Because the app uses ES modules, IndexedDB, and a service worker, use `localhost` or HTTPS rather than opening `index.html` as a `file://` URL.

**Windows (PowerShell)**

```powershell
py -m http.server 8000
```

**macOS / Linux**

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. No installation or compilation is required. On a supported browser, use its install option to install AetherText as a PWA. The app shell (cache generation v13) is cached after a successful first load. Basic editing remains available if service-worker registration is unavailable, but offline support and PWA installation require an appropriate origin.

## Features

### Editing and recovery

- Native `<textarea>` editor with multi-tab workspace, filename/type-aware behavior, cursor and selection restoration, scroll restoration, and debounced IndexedDB autosave.
- Per-tab manual and automatic local checkpoints. History is bounded to 40 checkpoints per tab and 120 total; restoring a checkpoint first saves the current draft. **Clear Session** clears workspace data and history.
- HTML tag suggestions and automatic close tags; paired quotes/brackets/backticks; skip-over of existing closing delimiters; Backspace removes an adjacent empty pair; configurable Tab indentation, editor size, line height, wrapping, and reduced motion.
- Find and Replace (`Ctrl/Cmd+F`, `Ctrl/Cmd+H`) supports literal search by default, case sensitivity, whole-word matching, regular expressions, and replacement tokens such as `$1` and `$&`.
- Command palette (`Ctrl/Cmd+K`), searchable snippets, word/character count, estimated reading time, source export, and rendered HTML export.
- Drag-free local file workflow: create a file with a chosen extension (`Ctrl/Cmd+N`), import multiple local files (`Ctrl/Cmd+O`), edit copies inside the workspace, and export them without overwriting originals.

## Supported file formats and previews

### File-aware preview behavior

The preview pane is not forced to be a browser for every extension:

| File type | Behavior |
|---|---|
| `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx` | Sandboxed browser preview with Markdown and supported raw HTML/CSS. MDX expressions/JSX compilation is not provided. |
| `.html`, `.htm`, `.xhtml` | Sandboxed browser preview of the HTML document or fragment. |
| `.css` | CSS playground that applies the stylesheet to sample components in a script-free, CSP-restricted iframe. |
| `.json`, `.jsonc`, `.ipynb` | Formatted JSON preview when valid; invalid/oversized input remains readable as source. JSONC comments are not parsed as JSON. |
| `.csv`, `.tsv` | CSV table / TSV table preview, limited to 100 rows and 20 columns to keep large files responsive. |
| `.svg` | Sanitized visual preview; the source stays editable in the editor. |
| Imported image, PDF, audio, and video assets | Binary is preserved as a Blob and shown in the corresponding browser preview where supported. These assets are preview-only rather than editable text. |
| `.txt`, `.log`, JavaScript, Python, other code/config files and unknown text extensions | The browser preview closes and AetherText behaves as a focused source/text editor. Source is never executed just because its extension is `.js`. |
| SCSS/Sass/Less and other unsupported preprocessors | Source-only editing unless explicitly listed above; no compiler is bundled. |

Imports are limited to 8 MiB per file. Obvious binary content is rejected as text. Imported binary assets are stored as Blobs in IndexedDB and can be exported again. Relative resources in imported HTML may not resolve to their original local folder because the browser file picker does not reveal the parent directory path. Project-folder asset resolution is future work.

### Browser preview, HTML/CSS and JavaScript

- **File CSS** preserves embedded styles and inline styling; **Aether Theme** strips document styling and applies adaptive AetherText CSS while retaining HTML structure and class names where possible.
- Ten themes selected via `body[data-theme]`, each with System, Light, and Dark appearance modes. Terminal/Hacker and Cyberpunk/Neon have dedicated light/dark palettes. Choose custom accent colors independently of the broad theme, with editor font size, line height, tab size, word wrap, and reduced-motion preferences.
- Responsive preview presets: Auto, Desktop (1280 px), Laptop (1024 px), Tablet (768 px), and Mobile (390 px). These are width presets, not complete device emulation.
- Document JavaScript runs only inside the sandboxed preview for Markdown/HTML documents that contain detected executable scripts or event handlers. It is disabled by default and requires explicit opt-in per tab. Scripts can read their own document and may make network requests; enable only content you trust. The iframe does not receive `allow-same-origin`, form submission or top-level navigation permissions. Some browser APIs, modules, popups, or site behaviors will therefore differ from a normal page.
- Standalone `.html` export can embed linked stylesheets that are reachable under browser CORS rules. Unavailable stylesheets remain linked and are reported. External images/fonts and non-CSS assets may still require network access or path adjustments. If JavaScript is enabled for a document, export requires confirmation because the downloaded HTML runs outside the iframe sandbox.
- A sandboxed reference panel can open documentation sites that allow iframe embedding; many sites intentionally block it.

## Preview styling modes

- **File CSS** (default) preserves the document’s embedded styles, linked stylesheets, and inline style attributes when the selected document is Markdown or HTML.
- **Aether Theme** suppresses document CSS and uses the current theme and appearance with adaptive layouts for recognized HTML structures. This is a visual adaptation, not a guarantee that every custom CSS layout can be reconstructed.
- JavaScript remains disabled by default and is an explicit per-document opt-in; file-source tabs such as `.js` never execute their contents.

### Fonts

- Twenty curated font-family choices are grouped by Everyday & UI, Display & geometric, Serif, and Monospace. Font names are not bundled font files; the browser uses them only if they are installed or otherwise available.
- **Load installed fonts** is opt-in and queries the Local Font Access API only after the user clicks. The family list is grouped and capped for display; browser support and permission are required.
- `tools/font_name_audit.py` can optionally scan a downloaded font directory and report internal family/style names. It uses Python's optional `fontTools` package, which is not an app dependency.

### Fine customization

Settings include accent color, editor font size, editor line height, indentation width, word wrapping, reduced-motion preference, preview appearance/style, viewport width, and the existing theme/font selections. Preferences are saved locally with the workspace.

## Run tests

Node.js 22 or newer is recommended for the test workflow. There are no app dependencies to install.

```bash
npm test
```

The project also includes syntax checks and a GitHub Actions workflow. Tests cover parser safety, editor assistance, file-type selection, data/asset previews, IndexedDB-related state logic, exports, appearance, and PWA cache metadata. Passing unit tests do not replace manual testing in the target browsers.

## GitHub Pages

A static-site workflow is included at `.github/workflows/pages.yml`. Push to the `main` branch and choose **Settings → Pages → Build and deployment → GitHub Actions** in the repository. If your default branch is not `main`, update the branch in the workflow. GitHub Pages makes the deployed site public; do not publish private documents, exports, fonts, keys, or personal data from this repository.

## Font-name audit (optional, Windows example)

```powershell
py -m pip install --user fonttools
py .\tools\font_name_audit.py "D:\Downloads\Fonts" --output-dir "$env:USERPROFILE\Desktop\FontNameReport"
```

The output contains `font-families.txt` (deduplicated family names) and `font-details.csv` (family, style/weight, full name, and source file). The font binaries are not copied into AetherText.

## Privacy and known limitations

- Drafts, settings, asset Blobs, and history are stored in IndexedDB in the current browser profile. Clearing browser data, using private browsing, or browser storage eviction can remove them. Export important work as a backup.
- Markdown parsing intentionally implements a lightweight subset rather than all CommonMark/GFM behavior.
- Adaptive styling is not a semantic redesign engine. Highly custom visual structures may need manual markup to render well without their original CSS.
- Browser font APIs, built-in PDF rendering, media codec support, iframe embedding, remote assets, and service-worker behavior vary by browser and origin.
- No end-to-end visual browser automation has been part of the current test suite; manually verify appearance, keyboard operation, accessibility, offline behavior, and import/export before a public release.

## Repository map

- `index.html` — application shell, accessible controls, and settings
- `styles.css` — layout, themes, editor and preview styling
- `app.js` — UI state, editor behavior, preview mode switching, persistence coordination, and PWA registration
- `db.js` — IndexedDB workspace and bounded document history store
- `file-types.js` — extension/type definitions, import checks, MIME type and preview-mode selection
- `file-preview.js` — CSV/TSV parsing, JSON preview, CSS playground builder, and SVG sanitization
- `browser-preview.js` — sandboxed Markdown/HTML document generation and JavaScript gating
- `markdown.js` — lightweight Markdown parser
- `editor-autocomplete.js` — HTML completion and paired-delimiter helpers
- `editor-tools.js` — search/replace, viewport presets, and snippets
- `html-export.js` — standalone HTML export with linked stylesheet handling
- `sw.js` and `manifest.webmanifest` — PWA metadata and versioned offline app-shell cache (v13)
- `tests/` — Node's built-in test suite
- `tools/font_name_audit.py` — optional font metadata utility
- `.github/workflows/` — automated tests and optional static-site deployment

## License

Licensed under the MIT License; see [LICENSE](LICENSE). Review the license and ownership of all artwork/assets before publishing. The repository currently contains project icons and does not bundle the user's system fonts.
