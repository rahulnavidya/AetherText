import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFallbackPreviewCSS } from '../browser-preview.js';

const [html, css, app, preview, serviceWorker, readme] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../browser-preview.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
]);

const themes = [
  'classic-writer', 'typewriter-focus', 'terminal-hacker', 'academic-paper',
  'zen-distraction-free', 'magazine-layout', 'dashboard-notion', 'cyberpunk-neon',
  'parchment-warm', 'high-contrast',
];

test('appearance settings expose system, light, and dark modes', () => {
  assert.match(html, /id="appearance-select"/);
  for (const value of ['system', 'light', 'dark']) assert.match(html, new RegExp(`<option value="${value}">`));
  assert.match(app, /const appearance = \['system', 'light', 'dark'\]/);
  assert.match(app, /appearance: workspaceState\.settings\.appearance \|\| 'system'/);
});

test('every theme inherits a global dark palette', () => {
  assert.match(css, /body\[data-appearance="dark"\]\s*\{/);
  for (const id of themes) {
    assert.ok(app.includes(`id: '${id}'`), `theme ${id} should be registered`);
    if (id !== 'terminal-hacker' && id !== 'cyberpunk-neon' && id !== 'high-contrast') {
      assert.ok(css.includes(`body[data-appearance="dark"][data-theme="${id}"]`), `${id} should have a readable dark-mode accent palette`);
    }
  }
});

test('Terminal and Cyberpunk have dedicated light and dark palettes', () => {
  for (const id of ['terminal-hacker', 'cyberpunk-neon']) {
    assert.ok(css.includes(`body[data-theme="${id}"][data-appearance="light"]`), `${id} light palette`);
    assert.ok(css.includes(`body[data-theme="${id}"][data-appearance="dark"]`), `${id} dark palette`);
  }
});

test('High-contrast theme defines light and dark accessibility palettes', () => {
  assert.match(css, /body\[data-theme="high-contrast"\]\[data-appearance="light"\]/);
  assert.match(css, /body\[data-theme="high-contrast"\]\[data-appearance="dark"\]/);
  assert.match(css, /outline: 4px solid var\(--focus-ring\)/);
});

test('appearance preference follows system changes and refreshes preview colors', () => {
  assert.match(app, /function resolvedAppearance\(mode\)/);
  assert.match(app, /prefers-color-scheme: dark/);
  assert.match(app, /workspaceState\?\.settings\?\.appearance === 'system'/);
  assert.match(app, /appearance: body\.dataset\.appearance/);
  assert.match(preview, /color-scheme:\$\{appearance\}/);
  const darkParchment = createFallbackPreviewCSS({ id: 'parchment-warm', appearance: 'dark', background: '#17130f', ink: '#eee0cc' });
  assert.match(darkParchment, /color-scheme:dark/);
  assert.match(darkParchment, /background:#17130f/);
  assert.doesNotMatch(darkParchment, /#f7ecd7|#654a38/);
  const lightTerminal = createFallbackPreviewCSS({ id: 'terminal-hacker', appearance: 'light', background: '#f7fff8', ink: '#203c29' });
  assert.match(lightTerminal, /color-scheme:light/);
  assert.doesNotMatch(lightTerminal, /text-shadow:0 0 10px currentColor/);
});

test('appearance and parser updates bust the old service-worker cache', () => {
  assert.match(serviceWorker, /aethertext-shell-v13/);
  assert.match(readme, /System, Light, and Dark appearance modes/);
  assert.match(readme, /cache generation v13/);
});


test('preview styling mode is selectable, searchable, and persisted with the workspace', () => {
  assert.match(html, /id="preview-style-select"/);
  assert.match(html, /value="file"/);
  assert.match(html, /value="aether"/);
  assert.match(html, /id="preview-style-badge"/);
  assert.match(html, /id="toggle-preview-style"/);
  assert.match(app, /toggle-preview-style.*applyPreviewStyle/s);
  assert.match(app, /previewStyle: 'file'/);
  assert.match(app, /const previewStyle = \['file', 'aether'\]/);
  assert.match(app, /previewStyle: workspaceState\.settings\.previewStyle \|\| 'file'/);
  assert.match(app, /function applyPreviewStyle\(/);
  assert.match(app, /Preview style: Aether Theme/);
  assert.match(app, /previewStyle, runJavaScript: active\.runJavaScript === true, fallbackCSS: getFallbackPreviewCSS\(previewStyle === 'aether'\)/);
  assert.match(readme, /Preview styling modes/);
});


test('font picker starts with twenty grouped curated families curated from the supplied inventory', () => {
  const match = app.match(/const CURATED_FONTS = \[([\s\S]*?)\n\];/);
  assert.ok(match, 'curated font list should exist');
  const entries = [...match[1].matchAll(/\{ id: '([^']+)', label: '([^']+)'/g)];
  assert.equal(entries.length, 20, 'keep the starter collection to twenty families');
  const labels = entries.map((entry) => entry[2]);
  for (const label of ['System UI', 'Segoe UI', 'Futura', 'Poppins', 'Montserrat', 'Manrope', 'Bebas Neue', 'Monospace (system)', 'Consolas', 'Cascadia Code', 'IBM Plex Mono', 'Fira Code', 'Bitstream Vera Sans Mono']) {
    assert.ok(labels.includes(label), `${label} should be included in the curated picker`);
  }
  assert.match(app, /const curatedGroups = new Map\(\)/, 'curated fonts should be grouped into optgroups');
  assert.match(html, /optgroup label="Monospace"/, 'static HTML fallback should include monospace grouping');
});

test('local font metadata is queried only after the user clicks and font faces are grouped by family', () => {
  assert.match(html, /id="discover-fonts" type="button">Load installed fonts<\/button>/);
  assert.match(app, /queryLocalFonts\(\)/);
  assert.match(app, /addEventListener\('click', \(\) => \{ void discoverLocalFonts\(\); \}\)/);
  assert.match(app, /familyKey = family\.toLocaleLowerCase\(\)/);
  assert.match(app, /const visibleFonts = matches\.slice\(0, 300\)/);
  assert.match(html, /only when clicked/);
});
