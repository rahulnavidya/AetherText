import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrowserDocument, createFallbackPreviewCSS } from '../browser-preview.js';

test('browser preview preserves embedded styles and parses Markdown inside HTML layouts', () => {
  const source = `<style>body{background:#123} .meta{color:#f0f}</style>
# Vault
<div class="card">
- [Example](https://example.com) <span class="meta">photoset</span>
</div>`;
  const html = buildBrowserDocument(source, { fallbackCSS: 'body{color:#fff}' });
  assert.match(html, /body\{background:#123\}/);
  assert.match(html, /\.meta\{color:#f0f\}/);
  assert.match(html, /<h1>Vault<\/h1>/);
  assert.match(html, /<div class="card">/);
  assert.match(html, /<ul><li><a href="https:\/\/example\.com\//);
  assert.match(html, /<span class="meta">photoset<\/span>/);
  assert.doesNotMatch(html, /AETHER_STYLE_BLOCK/);
});

test('browser preview strips scripts, event attributes, unsafe URLs, and embedded frames', () => {
  const source = `<style>.x{color:red}</style>
<div onclick="alert(1)"><script>parent.document.body.innerHTML='bad'</script>
<a href="javascript:alert(1)">unsafe</a><iframe src="https://example.com"></iframe></div>`;
  const html = buildBrowserDocument(source);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /parent\.document/);
  assert.doesNotMatch(html, /<iframe\b/i);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /href="#"/);
  assert.match(html, /aetherTextPreview/);
});

test('complete HTML documents keep their CSS while author scripts are removed', () => {
  const html = buildBrowserDocument('<!doctype html><html><head><style>body{color:tomato}</style></head><body onload="x()"><h1>Hi</h1><script>alert(1)</script></body></html>');
  assert.match(html, /body\{color:tomato\}/);
  assert.match(html, /<h1>Hi<\/h1>/);
  assert.doesNotMatch(html, /onload=/i);
  assert.doesNotMatch(html, /alert\(1\)/);
  assert.match(html, /aetherTextPreview/);
});

test('fallback preview styles match the selected theme palette', () => {
  const css = createFallbackPreviewCSS({ id: 'high-contrast', background: '#000', ink: '#fff' });
  assert.match(css, /background:#000/);
  assert.match(css, /color:#fff/);
  assert.match(css, /font-size:19px/);
});

test('moves linked stylesheets into the browser document head', () => {
  const html = buildBrowserDocument(`<link rel="stylesheet" href="./vault.css">\n# Vault\n\nA paragraph.`);
  assert.match(html, /<head>[\s\S]*<link rel="stylesheet" href="\.\/vault\.css">[\s\S]*<\/head>/);
  assert.doesNotMatch(html.match(/<body>[\s\S]*?<\/body>/)?.[0] || '', /<link rel="stylesheet"/);
});


test('does not display stylesheet extraction placeholders in Markdown-only layouts', () => {
  const html = buildBrowserDocument('<style>h1{color:red}</style>\n# A styled Markdown heading');
  assert.match(html, /h1\{color:red\}/);
  assert.match(html, /<h1>A styled Markdown heading<\/h1>/);
  assert.doesNotMatch(html, /AETHER_(?:STYLE|STYLESHEET)_BLOCK/);
});

test('empty-link placeholders have polished fallback styles while author CSS stays later in cascade', () => {
  const html = buildBrowserDocument('<style>a { background: purple; } .quality { color: gold; }</style>\n- []()');
  assert.match(html, /a\.aether-empty-link\).*min-width:220px/);
  assert.match(html, /content:"LINK"/);
  assert.match(html, /class="aether-empty-link"/);
  assert.ok(html.indexOf('a { background: purple; }') > html.indexOf('content:"LINK"'));
});


test('Aether Theme mode suppresses embedded CSS, linked stylesheets, and inline styling', () => {
  const themeCSS = createFallbackPreviewCSS({
    id: 'cyberpunk-neon', appearance: 'dark', background: '#130d20', ink: '#e5d6f7',
    heading: '#f5eafb', link: '#53efff', codeBackground: '#20132e', rule: '#684085',
    font: 'Georgia, serif', appFont: 'system-ui, sans-serif', adaptive: true,
  });
  const html = buildBrowserDocument(`<style>body { background: red } .repository-card { color: lime }</style>
<link rel="stylesheet" href="./custom-vault.css">
# Archive
<div class="repository-card" style="color: red">
<h2 class="repository-title">Vault</h2>
<a href="https://example.com" style="color: hotpink">Download</a>
</div>`, { previewStyle: 'aether', fallbackCSS: themeCSS });

  assert.match(html, /class="markdown-body aether-adaptive"/);
  assert.match(html, /class="repository-card"/);
  assert.match(html, /class="repository-title"/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /\.aether-adaptive :where\(\.repository-card a,\.directory a\)/);
  assert.match(html, /text-transform:uppercase/); // Cyberpunk theme identity survives the CSS reset.
  assert.doesNotMatch(html, /background: red/i);
  assert.doesNotMatch(html, /color: lime/i);
  assert.doesNotMatch(html, /custom-vault\.css/);
  assert.doesNotMatch(html, /style="color: (?:red|hotpink)"/i);
  assert.doesNotMatch(html, /AETHER_(?:STYLE|STYLESHEET)_BLOCK/);
});

test('Aether Theme mode strips the head CSS from complete HTML documents but keeps their body content', () => {
  const themeCSS = createFallbackPreviewCSS({ id: 'dashboard-notion', adaptive: true, background: '#fff', ink: '#222', link: '#476b56' });
  const html = buildBrowserDocument(`<!doctype html><html><head>
<title>Vault</title><link rel="stylesheet" href="vault.css"><style>body{background:red}</style>
</head><body style="background: pink"><main class="card" style="color: red"><h1>Vault</h1><p>Kept content</p></main></body></html>`, {
    previewStyle: 'aether', fallbackCSS: themeCSS,
  });
  assert.match(html, /class="markdown-body aether-adaptive"/);
  assert.match(html, /class="card"/);
  assert.match(html, /<h1>Vault<\/h1>/);
  assert.match(html, /Kept content/);
  assert.doesNotMatch(html, /vault\.css/);
  assert.doesNotMatch(html, /background:red|background: pink|color: red/i);
  assert.doesNotMatch(html, /<title>Vault<\/title>/);
  assert.doesNotMatch(html, /style="/i);
});

test('File CSS remains the default and preserves author styling', () => {
  const html = buildBrowserDocument('<style>.card{background:purple}</style>\n<div class="card" style="color: orange">Saved design</div>');
  assert.match(html, /\.card\{background:purple\}/);
  assert.match(html, /style="color: orange"/);
});

test('adaptive fallback CSS creates responsive theme-specific document styles', () => {
  const themes = ['classic-writer', 'typewriter-focus', 'terminal-hacker', 'academic-paper', 'zen-distraction-free', 'magazine-layout', 'dashboard-notion', 'cyberpunk-neon', 'parchment-warm', 'high-contrast'];
  for (const id of themes) {
    const css = createFallbackPreviewCSS({ id, adaptive: true, appearance: 'dark', background: '#121212', ink: '#eee', heading: '#fff', link: '#7ff', codeBackground: '#202020', rule: '#444', font: 'Georgia, serif', appFont: 'system-ui, sans-serif' });
    assert.match(css, /\.aether-adaptive/);
    assert.match(css, /@media\(max-width:680px\)/);
  }
  assert.match(createFallbackPreviewCSS({ id: 'terminal-hacker', adaptive: true, appearance: 'dark' }), /content:\"> "/);
  assert.match(createFallbackPreviewCSS({ id: 'cyberpunk-neon', adaptive: true, appearance: 'dark' }), /text-shadow:0 0 18px/);
});
