import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  fileExtension, getFileType, isMarkdownFile, isHTMLFile, supportsMarkupPreview,
  mimeTypeForFilename, filenameForType, cleanFilename, looksLikeBinaryText,
  IMPORT_MAX_BYTES, IMPORT_ACCEPT,
} from '../file-types.js';
import { buildBrowserDocument } from '../browser-preview.js';

const [app, index, serviceWorker, readme] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
]);

test('classifies Markdown, HTML, plain text, and common source formats', () => {
  assert.equal(getFileType('notes.md').kind, 'markdown');
  assert.equal(getFileType('notes.markdown').kind, 'markdown');
  assert.equal(getFileType('page.html').kind, 'html');
  assert.equal(getFileType('page.htm').kind, 'html');
  assert.equal(getFileType('notes.txt').kind, 'plain');
  assert.equal(getFileType('styles.css').kind, 'code');
  assert.equal(getFileType('app.js').kind, 'code');
  assert.equal(getFileType('data.json').kind, 'code');
  assert.equal(getFileType('main.py').kind, 'code');
  assert.equal(getFileType('Makefile').kind, 'code');
  assert.equal(cleanFilename('Makefile', '.md'), 'Makefile');
  assert.equal(getFileType('unknown.custom').kind, 'plain');
  assert.equal(isMarkdownFile('file.mdx'), true);
  assert.equal(isHTMLFile('file.xhtml'), true);
  assert.equal(supportsMarkupPreview('file.css'), false);
  assert.equal(supportsMarkupPreview('file.html'), true);
});

test('uses the original or selected extension and a suitable MIME type on export', () => {
  assert.equal(fileExtension('C:\\work\\index.HTML'), '.html');
  assert.equal(filenameForType('Untitled.md', 'html'), 'Untitled.html');
  assert.equal(filenameForType('notes', 'css'), 'notes.css');
  assert.equal(filenameForType('config.env', 'other'), 'config.env');
  assert.equal(cleanFilename('notes', '.txt'), 'notes.txt');
  assert.equal(cleanFilename('page.html', '.md'), 'page.html');
  assert.equal(mimeTypeForFilename('index.html'), 'text/html; charset=utf-8');
  assert.equal(mimeTypeForFilename('rules.css'), 'text/css; charset=utf-8');
  assert.equal(mimeTypeForFilename('unknown.foo'), 'text/plain; charset=utf-8');
});

test('plain text preview shows Markdown and HTML literally, without interpreting them', () => {
  const source = '# not a heading\n**not bold**\n<script>alert(1)</script>\n<span>literal</span>';
  const html = buildBrowserDocument(source, { filename: 'notes.txt' });
  assert.match(html, /language-text/);
  assert.match(html, /# not a heading/);
  assert.match(html, /\*\*not bold\*\*/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;span&gt;literal&lt;\/span&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<h1>not a heading<\/h1>/);
});

test('CSS and JavaScript source files render as escaped inert code rather than styles or executable script', () => {
  const css = buildBrowserDocument('body { color: red; }', { filename: 'theme.css' });
  assert.match(css, /class="language-css"/);
  assert.match(css, /<code class="language-css">body \{ color: red; \}<\/code>/);
  assert.doesNotMatch(css, /<style>body \{ color: red; \}<\/style>/);

  const js = buildBrowserDocument('document.body.textContent = "hello";', { filename: 'main.js', runJavaScript: true });
  assert.match(js, /class="language-javascript"/);
  assert.match(js, /document\.body\.textContent/);
  assert.doesNotMatch(js, /<script>document\.body\.textContent/);
});

test('HTML file fragments remain HTML and are not reinterpreted as Markdown', () => {
  const html = buildBrowserDocument('<h1>Visible heading</h1><p>**literal asterisks**</p>', { filename: 'fragment.html' });
  assert.match(html, /<h1>Visible heading<\/h1>/);
  assert.match(html, /<p>\*\*literal asterisks\*\*<\/p>/);
  assert.doesNotMatch(html, /<strong>literal asterisks<\/strong>/);
});

test('file creation and open/import controls are connected and file types are cached offline', () => {
  for (const id of ['new-file-backdrop', 'new-file-form', 'new-file-name', 'new-file-type', 'open-files', 'import-files', 'source-type-label']) {
    assert.ok(index.includes(`id="${id}"`), `${id} should exist`);
  }
  assert.match(app, /async function importSelectedFiles\(/);
  assert.match(app, /function createNewFile\(/);
  assert.match(app, /function updateFileModeUI\(/);
  assert.match(index, /Open local text files \(Ctrl\+O\)/);
  assert.match(serviceWorker, /'\.\/file-types\.js'/);
  assert.match(readme, /Supported file formats/);
  assert.equal(IMPORT_MAX_BYTES, 8 * 1024 * 1024);
  assert.match(IMPORT_ACCEPT, /\.html/);
  assert.match(IMPORT_ACCEPT, /\.txt/);
  assert.match(index, /accept=.*\*\/\*/);
});

test('binary detection allows ordinary source text but rejects NUL and control-heavy data', () => {
  assert.equal(looksLikeBinaryText('a\tword\nnext line'), false);
  assert.equal(looksLikeBinaryText('bad\u0000binary'), true);
  assert.equal(looksLikeBinaryText('\u0001\u0002\u0003\u0004'.repeat(20)), true);
});
