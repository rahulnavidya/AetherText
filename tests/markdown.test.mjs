import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../markdown.js';

test('renders headings, paragraphs, and basic emphasis', () => {
  const html = renderMarkdown('# Hello\n\nA **bold** and *gentle* line with ~~old~~ text.');
  assert.match(html, /<h1>Hello<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>gentle<\/em>/);
  assert.match(html, /<del>old<\/del>/);
});

test('escapes raw HTML rather than executing it', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<img\s/i);
});

test('blocks javascript URLs while retaining safe links', () => {
  const html = renderMarkdown('[bad](javascript:alert(1)) and [good](https://example.com)');
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /href="https:\/\/example\.com\//);
});

test('renders fenced code as escaped text', () => {
  const html = renderMarkdown('```html\n<img src=x> & hello\n```');
  assert.match(html, /<pre><code class="language-html">&lt;img src=x&gt; &amp; hello<\/code><\/pre>/);
});

test('renders lists, task checkboxes, blockquotes, and tables without inline styles', () => {
  const html = renderMarkdown('- [x] Finished\n- [ ] Pending\n\n> Keep going.\n\n| A | B |\n| :--- | ---: |\n| x | y |');
  assert.match(html, /type="checkbox" disabled checked/);
  assert.match(html, /type="checkbox" disabled>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<th class="align-left">A<\/th>/);
  assert.match(html, /<td class="align-right">y<\/td>/);
  assert.doesNotMatch(html, /\sstyle=/i);
});


test('keeps inline code and HTML badges inside Markdown link labels intact', async () => {
  const { renderMarkdownBrowser } = await import('../markdown.js');
  const html = renderMarkdownBrowser('- [mixed bag ``480p–1080p``](https://example.com) <span class="meta">archive</span>');
  assert.match(html, /<a href="https:\/\/example\.com\//);
  assert.match(html, /<code>480p–1080p<\/code>/);
  assert.match(html, /<span class="meta">archive<\/span>/);
  assert.doesNotMatch(html, /\u0001\d+\u0002/);
});

test('browser mode repairs Markdown links whose labels wrap after an opening bracket', async () => {
  const { renderMarkdownBrowser } = await import('../markdown.js');
  const html = renderMarkdownBrowser('- [\n  Pie My Married Pussy!](https://example.com/video.mp4)(downloaded)\n- [\nStrange Science](https://example.com/strange)');
  assert.match(html, /<a href="https:\/\/example\.com\/video\.mp4"[^>]*>Pie My Married Pussy!<\/a>\(downloaded\)/);
  assert.match(html, /<a href="https:\/\/example\.com\/strange"[^>]*>Strange Science<\/a>/);
  assert.doesNotMatch(html, /<li>\[<\/li>/);
  assert.doesNotMatch(html, /\]\(https:\/\/example\.com/);
});

test('browser mode turns empty archive links into accessible styleable placeholders', async () => {
  const { renderMarkdownBrowser } = await import('../markdown.js');
  const html = renderMarkdownBrowser('- []()\n- [](https://bunkr.example/archive)');
  assert.equal((html.match(/class="aether-empty-link"/g) || []).length, 2);
  assert.equal((html.match(/class="quality">HQ<\/span>/g) || []).length, 2);
  assert.match(html, /role="img" aria-label="Empty link placeholder"/);
  assert.match(html, /href="https:\/\/bunkr\.example\/archive" class="aether-empty-link"/);
  assert.doesNotMatch(html, /\[\]\(\)/);
});

test('multiline-link repair does not mutate fenced code examples', async () => {
  const { renderMarkdownBrowser } = await import('../markdown.js');
  const html = renderMarkdownBrowser('```text\n- [\nExample](https://example.com)\n```');
  assert.match(html, /<pre><code class="language-text">- \[\nExample\]\(https:\/\/example\.com\)<\/code><\/pre>/);
});

test('browser mode handles links with nested square brackets and missing destinations', async () => {
  const { renderMarkdownBrowser } = await import('../markdown.js');
  const html = renderMarkdownBrowser('- [file [HQ]](https://example.com/file)\n- [Unfinished archive `VHQ`]()');
  assert.match(html, /<a href="https:\/\/example\.com\/file"[^>]*>file \[HQ\]<\/a>/);
  assert.match(html, /class="aether-empty-link" role="note" aria-label="Link destination missing">Unfinished archive <code>VHQ<\/code><span class="quality">HQ<\/span><\/a>/);
  assert.doesNotMatch(html, /\[file \[HQ\]\]\(https:\/\/example\.com/);
});

test('underscores inside filenames do not become italic emphasis', async () => {
  const { renderMarkdownBrowser } = await import('../markdown.js');
  const html = renderMarkdownBrowser('[Riding_Cock_in_a_Slingshot](https://example.com/file)');
  assert.match(html, />Riding_Cock_in_a_Slingshot<\/a>/);
  assert.doesNotMatch(html, /<em>/);
});

test('wrapped URL closing parentheses are repaired with nested label brackets', async () => {
  const { renderMarkdownBrowser } = await import('../markdown.js');
  const html = renderMarkdownBrowser('- [BUSH GROWTH DAY 1[HQ]](https://example.com/archive\n)');
  assert.match(html, /<a href="https:\/\/example\.com\/archive"[^>]*>BUSH GROWTH DAY 1\[HQ\]<\/a>/);
  assert.doesNotMatch(html, /<p>\)<\/p>/);
});
