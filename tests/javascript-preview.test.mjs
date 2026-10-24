import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBrowserDocument, hasDocumentJavaScript } from '../browser-preview.js';
import { buildStandaloneHTML } from '../html-export.js';

const [html, app, sw, readme] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
]);

function authorScripts(documentHTML) {
  return [...documentHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => match[1])
    .filter((content) => !content.includes('aetherTextPreview'));
}

test('detects executable script blocks and inline handlers', () => {
  assert.equal(hasDocumentJavaScript('<script>document.body.dataset.ready = "yes";</script>'), true);
  assert.equal(hasDocumentJavaScript('<script type="module">export const x = 1;</script>'), true);
  assert.equal(hasDocumentJavaScript('<button onclick="this.textContent=\'Done\'">Go</button>'), true);
  assert.equal(hasDocumentJavaScript('<script src="./app.js"></script>'), true);
});

test('JavaScript detection ignores code fences, inline code, comments, and data-only script tags', () => {
  assert.equal(hasDocumentJavaScript('```html\n<script>alert(1)</script>\n<button onclick="x()">x</button>\n```'), false);
  assert.equal(hasDocumentJavaScript('Example: `<script>alert(1)</script>`'), false);
  assert.equal(hasDocumentJavaScript('<!-- <script>alert(1)</script><button onclick="x()"> -->'), false);
  assert.equal(hasDocumentJavaScript('<script type="application/json">{"message":"not executable"}</script>'), false);
});

test('author JavaScript and event handlers are stripped by default', () => {
  const source = '<script>document.body.dataset.author = "ran";</script><button onclick="this.textContent=\'bad\'">Tap</button>';
  const html = buildBrowserDocument(source);
  assert.doesNotMatch(authorScripts(html).join('\n'), /dataset\.author/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.match(html, /Tap/);
});

test('opt-in executes only current-document script markup and keeps the iframe bridge', () => {
  const source = '<script>document.body.dataset.author = "ran";</script>\n<button onclick="this.textContent=\'Done\'">Tap</button>\n<script src="./local-widget.js"></script>';
  const html = buildBrowserDocument(source, { runJavaScript: true });
  const scripts = authorScripts(html).join('\n');
  assert.match(scripts, /document\.body\.dataset\.author = "ran"/);
  assert.match(html, /onclick="this\.textContent=/i);
  assert.match(html, /<script src="\.\/local-widget\.js"><\/script>/);
  assert.match(html, /aetherTextPreview/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<iframe\b/i);
});

test('requesting JavaScript does nothing when executable JavaScript is not present', () => {
  const html = buildBrowserDocument('<h1>Only markup</h1>', { runJavaScript: true });
  assert.doesNotMatch(html, /Only markup[\s\S]*?onclick=/i);
  assert.deepEqual(authorScripts(html), []);
});

test('complete HTML document scripts remain disabled until the per-document option is enabled', () => {
  const source = '<!doctype html><html><head><script>window.headScript = true;</script></head><body onload="window.loaded = true"><button onclick="window.clicked=true">Tap</button><script>window.bodyScript = true;</script></body></html>';
  const off = buildBrowserDocument(source);
  assert.doesNotMatch(off, /window\.headScript|window\.bodyScript|onload=|onclick=/);
  const on = buildBrowserDocument(source, { runJavaScript: true });
  assert.match(on, /window\.headScript = true/);
  assert.match(on, /window\.bodyScript = true/);
  assert.match(on, /onload="window\.loaded = true"/);
  assert.match(on, /onclick="window\.clicked=true"/);
});

test('adaptive mode suppresses document styling but can run opted-in document scripts', () => {
  const source = '<!doctype html><html><head><style>body{background:red}</style><script>document.body.dataset.loaded="yes";</script></head><body style="color: lime"><h1>Adaptive</h1></body></html>';
  const html = buildBrowserDocument(source, { previewStyle: 'aether', runJavaScript: true, fallbackCSS: '.aether-adaptive{color:var(--ink)}' });
  assert.match(html, /document\.body\.dataset\.loaded="yes"/);
  assert.match(html, /class="markdown-body aether-adaptive"/);
  assert.doesNotMatch(html, /background:red|style="color: lime"/i);
});

test('script switch is available in the preview and authorization is per tab, not a global app preference', () => {
  assert.match(html, /id="toggle-preview-js"/);
  assert.match(html, /sandbox="allow-scripts allow-popups"/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.doesNotMatch(html, /allow-popups-to-escape-sandbox/);
  assert.match(app, /runJavaScript: Boolean\(tab\.runJavaScript\)/);
  assert.match(app, /runJavaScript: active\.runJavaScript === true/);
  assert.match(app, /Run JavaScript for this document only/);
  assert.match(app, /may make network requests/);
  assert.match(readme, /disabled by default/);
  assert.match(sw, /aethertext-shell-v13/);
});


test('inline-code script examples stay inert even when another script in the document is enabled', () => {
  const source = '`<script>document.body.dataset.example="do-not-run";</script>`\n' +
    '<script>document.body.dataset.real="run";</script>';
  const html = buildBrowserDocument(source, { runJavaScript: true });
  const scripts = authorScripts(html).join('\n');
  assert.doesNotMatch(scripts, /dataset\.example/);
  assert.match(scripts, /dataset\.real/);
  assert.match(html, /<code>&lt;script&gt;document\.body\.dataset\.example/);
});

test('standalone HTML export includes author scripts only after the document opted in', async () => {
  const source = '<script>document.body.dataset.exported="yes";</script><h1>Export</h1>';
  const safeExport = await buildStandaloneHTML(source, { baseURL: 'http://localhost/' });
  assert.doesNotMatch(safeExport.html, /dataset\.exported/);
  const optedInExport = await buildStandaloneHTML(source, { baseURL: 'http://localhost/', runJavaScript: true });
  assert.match(optedInExport.html, /dataset\.exported/);
  assert.doesNotMatch(optedInExport.html, /aetherTextPreview/);
});

test('HTML export prompts before moving an opted-in script outside the iframe sandbox', () => {
  assert.match(app, /This HTML export will include the active document’s JavaScript/);
  assert.match(app, /When opened separately, exported scripts run outside AetherText’s preview sandbox/);
});
