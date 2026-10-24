import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getFileType, getPreviewMode, IMPORT_ACCEPT } from '../file-types.js';
import { parseDelimitedText, parseJSONPreview, buildCSSPlayground, sanitizeSVGForImage } from '../file-preview.js';

const [app, html, css, sw, readme] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
]);

test('preview mode is selected by file type instead of forcing every tab into a browser', () => {
  assert.equal(getPreviewMode('page.md'), 'browser');
  assert.equal(getPreviewMode('page.html'), 'browser');
  assert.equal(getPreviewMode('theme.css'), 'css-demo');
  assert.equal(getPreviewMode('data.json'), 'json-data');
  assert.equal(getPreviewMode('sheet.csv'), 'tabular-data');
  assert.equal(getPreviewMode('art.svg'), 'svg-image');
  assert.equal(getPreviewMode('notes.txt'), 'source-only');
  assert.equal(getPreviewMode('main.js'), 'source-only');
  assert.equal(getPreviewMode('archive.png'), 'asset-image');
  assert.equal(getPreviewMode('document.pdf'), 'asset-pdf');
  assert.equal(getPreviewMode('asset.unknown', { hasAsset: true, assetMime: 'image/webp' }), 'asset-image');
});

test('file type detection includes image, PDF, audio and video assets', () => {
  assert.equal(getFileType('image.webp').kind, 'asset-image');
  assert.equal(getFileType('scan.pdf').kind, 'asset-pdf');
  assert.equal(getFileType('voice.ogg').kind, 'asset-audio');
  assert.equal(getFileType('movie.webm').kind, 'asset-video');
  for (const extension of ['.webp', '.pdf', '.ogg', '.webm']) assert.ok(IMPORT_ACCEPT.includes(extension));
});

test('CSV/TSV reader handles quoted delimiters, escaped quotes, CRLF and preview limits', () => {
  const parsed = parseDelimitedText('Name,Quote\r\nAda,"Hello, world"\r\nLin,"She said ""yes"""');
  assert.deepEqual(parsed.rows, [['Name', 'Quote'], ['Ada', 'Hello, world'], ['Lin', 'She said "yes"']]);
  const tsv = parseDelimitedText('a\tb\n1\t2', '\t');
  assert.deepEqual(tsv.rows, [['a', 'b'], ['1', '2']]);
  const limited = parseDelimitedText('h\n1\n2\n3', ',', { rowLimit: 2 });
  assert.equal(limited.rows.length, 2);
  assert.equal(limited.truncated, true);
  const trailingNewline = parseDelimitedText('a,b\n1,2\n');
  assert.deepEqual(trailingNewline.rows, [['a', 'b'], ['1', '2']]);
  const wide = parseDelimitedText(Array.from({ length: 22 }, (_, i) => `c${i}`).join(','), ',', { columnLimit: 20 });
  assert.equal(wide.rows[0].length, 20);
  assert.equal(wide.columnsTruncated, true);
});

test('JSON data preview formats valid JSON and retains invalid input with an error', () => {
  const valid = parseJSONPreview('{"key":1,"child":{"ok":true}}');
  assert.equal(valid.valid, true);
  assert.equal(valid.formatted, '{\n  "key": 1,\n  "child": {\n    "ok": true\n  }\n}');
  const invalid = parseJSONPreview('{broken');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.formatted, '{broken');
  assert.ok(invalid.error);
});

test('CSS playground uses a restrictive CSP, shows sample components and includes no execution bridge', () => {
  const preview = buildCSSPlayground('.card { border-radius: 30px; }');
  assert.match(preview, /Content-Security-Policy/);
  assert.match(preview, /default-src 'none'/);
  assert.match(preview, /Your stylesheet, in action/);
  assert.match(preview, /class="card"/);
  assert.doesNotMatch(preview, /<script\b/i);
  assert.match(buildCSSPlayground('body { color: red; }'), /body \{ color: red; \}/);
});

test('SVG visual preview removes scripts, event handlers, foreign objects and remote references', () => {
  const cleaned = sanitizeSVGForImage('<svg><script>bad()</script><foreignObject>bad</foreignObject><path onclick="bad()" d="M0 0"/><use href="https://example.com/a.svg#id"/><use href="#safe-gradient"/></svg>');
  assert.doesNotMatch(cleaned, /<script\b/i);
  assert.doesNotMatch(cleaned, /foreignObject/i);
  assert.doesNotMatch(cleaned, /onclick=/i);
  assert.doesNotMatch(cleaned, /https:\/\//i);
  assert.match(cleaned, /href="#safe-gradient"/);
});

test('editor-only documents close the preview; visual/data modes render with safe DOM surfaces', () => {
  assert.match(app, /body\.classList\.toggle\('editor-only', editorOnly\)/);
  assert.match(app, /body\.classList\.toggle\('asset-only', assetOnly\)/);
  assert.match(app, /function renderNonBrowserPreview\(/);
  assert.match(app, /createPreviewElement\('td'/);
  assert.match(app, /textContent = String\(text\)/);
  assert.match(app, /editor\.disabled = assetOnly/);
  assert.match(html, /id="nonbrowser-preview-surface"/);
  assert.match(css, /body\.editor-only \.preview-pane \{ display: none !important; \}/);
});

test('binary assets are stored as Blobs and can be exported without converting to text', () => {
  assert.match(app, /assetBlob: typeof Blob !== 'undefined' && tab\.assetBlob instanceof Blob/);
  assert.match(app, /assetTab\.assetBlob = file\.slice\(0, file\.size, assetMime\)/);
  assert.match(app, /if \(tab\.assetBlob instanceof Blob\) downloadBlob/);
  assert.match(app, /URL\.createObjectURL\(tab\.assetBlob\)/);
});

test('fine customization settings persist and apply accent, editor size, wrapping, tab size and motion preference', () => {
  for (const id of ['accent-color', 'reset-accent', 'editor-font-size', 'editor-line-height', 'editor-tab-size', 'editor-word-wrap', 'reduce-motion']) {
    assert.ok(html.includes(`id="${id}"`), `${id} setting is present`);
  }
  for (const key of ['accentColor', 'editorFontSize', 'editorLineHeight', 'editorTabSize', 'editorWordWrap', 'reduceMotion']) {
    assert.ok(app.includes(key), `${key} setting is implemented`);
  }
  assert.match(app, /function applyAccentColor\(/);
  assert.match(app, /function applyEditorPreferences\(/);
  assert.match(css, /body\[data-reduce-motion="on"\]/);
  assert.match(css, /body\[data-word-wrap="off"\]/);
});

test('new preview module is included in the offline shell and release docs mention preview modes', () => {
  assert.match(sw, /aethertext-shell-v13/);
  assert.match(sw, /\.\/file-preview\.js/);
  assert.match(readme, /CSS playground/i);
  assert.match(readme, /CSV table/i);
});
