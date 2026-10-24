import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all(['index.html','app.js','db.js','sw.js','styles.css','README.md','package.json','file-types.js'].map(async name => [name, await readFile(new URL(`../${name}`, import.meta.url), 'utf8')])));

test('milestone controls are present and connected to the source app', () => {
  for (const id of ['open-find','find-backdrop','find-input','replace-input','replace-all','viewport-select','export-html','open-snippets','snippets-backdrop','open-history','history-backdrop','create-checkpoint','autocomplete-popup','autocomplete-enabled','auto-close-enabled']) assert.ok(files['index.html'].includes(`id="${id}"`), `${id} must exist`);
  for (const name of ['openFind','findNextMatch','replaceAllMatches','applyViewport','exportActiveHTML','openSnippets','openHistory','createHistoryCheckpoint','restoreHistoryVersion']) assert.ok(files['app.js'].includes(`function ${name}(`) || files['app.js'].includes(`async function ${name}(`), `${name} must exist`);
});

test('viewport preference persists with workspace settings and CSS sizes the preview frame', () => {
  assert.match(files['app.js'], /previewViewport: workspaceState\.settings\.previewViewport \|\| 'responsive'/);
  assert.match(files['app.js'], /function applyViewport\(/);
  for (const id of ['responsive','desktop','laptop','tablet','mobile']) assert.ok(files['styles.css'].includes(`data-preview-viewport="${id}"`) || id === 'responsive', `${id} viewport CSS`);
});

test('history is a bounded IndexedDB store and Clear Session clears it', () => {
  assert.match(files['db.js'], /const DB_VERSION = 2/);
  assert.match(files['db.js'], /const HISTORY_TOTAL_LIMIT = 120/);
  assert.match(files['db.js'], /createObjectStore\(HISTORY_STORE, \{ keyPath: 'id' \}\)/);
  assert.match(files['db.js'], /function writeHistoryVersion|export async function writeHistoryVersion/);
  assert.match(files['db.js'], /transaction\.objectStore\(HISTORY_STORE\)\.clear\(\)/);
  assert.match(files['app.js'], /writeHistoryVersion\(version, 40\)/);
});

test('no framework or build dependency added and service worker precaches new modules', () => {
  assert.match(files['package.json'], /"version": "2\.0\.0"/);
  assert.match(files['sw.js'], /aethertext-shell-v13/);
  assert.match(files['sw.js'], /'\.\/editor-tools\.js'/);
  assert.match(files['sw.js'], /'\.\/html-export\.js'/);
  assert.match(files['sw.js'], /'\.\/editor-autocomplete\.js'/);
  assert.match(files['sw.js'], /'\.\/file-types\.js'/);
  assert.match(files['sw.js'], /'\.\/file-preview\.js'/);
  assert.match(files['README.md'], /Find and Replace/);
  assert.match(files['README.md'], /document history/i);
  assert.match(files['README.md'], /Standalone `?\.html`? export/i);
  assert.match(files['index.html'], /id="autocomplete-enabled"/);
  assert.match(files['index.html'], /id="auto-close-enabled"/);
  assert.match(files['app.js'], /function handleEditorKeydown\(/);
  assert.match(files['README.md'], /HTML tag suggestions/i);
  assert.doesNotMatch(files['index.html'], /react\.js|vue\.js|angular\.js/i);
});
