import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HTML_TAGS, VOID_HTML_TAGS, getTagCompletionContext, suggestHTMLTags,
  completeTagToken, getOpenTagBeforeCursor, getTagAutoCloseEdit,
  getPairedDelimiterEdit, isInsideMarkdownCode,
} from '../editor-autocomplete.js';

test('HTML completion finds opening and closing tag prefixes at the caret', () => {
  assert.deepEqual(getTagCompletionContext('<sp', 3), { start: 0, end: 3, prefix: 'sp', closing: false });
  assert.deepEqual(getTagCompletionContext('text </spa', 10), { start: 5, end: 10, prefix: 'spa', closing: true });
  assert.equal(getTagCompletionContext('escaped \\<sp', 11), null);
  assert.ok(HTML_TAGS.includes('span'));
});

test('suggestions filter by prefix and omit void tags from close-tag suggestions', () => {
  assert.deepEqual(suggestHTMLTags('sp', false), ['span']);
  assert.ok(suggestHTMLTags('', true).every((tag) => !VOID_HTML_TAGS.has(tag)));
  assert.ok(suggestHTMLTags('d').includes('div'));
});

test('accepting a normal opening tag adds its closing tag and leaves caret inside', () => {
  const result = completeTagToken('Hello <sp there', { start: 6, end: 9, prefix: 'sp', closing: false }, 'span');
  assert.equal(result.text, 'Hello <span></span> there');
  assert.equal(result.text.slice(0, result.cursor), 'Hello <span>');
});

test('accepting void and closing tags does not add an extra closing tag', () => {
  const voidResult = completeTagToken('<im', { start: 0, end: 3, prefix: 'im', closing: false }, 'img');
  assert.equal(voidResult.text, '<img>');
  const closeResult = completeTagToken('</sp', { start: 0, end: 4, prefix: 'sp', closing: true }, 'span');
  assert.equal(closeResult.text, '</span>');
});

test('auto-close recognises ordinary elements but not void or self-closing tags', () => {
  assert.deepEqual(getOpenTagBeforeCursor('<span class="tag"', 17), { tag: 'span', start: 0, end: 17 });
  assert.equal(getOpenTagBeforeCursor('<img src="x"', 12), null);
  assert.equal(getOpenTagBeforeCursor('<widget/', 8), null);
  assert.deepEqual(getTagAutoCloseEdit('<span', 5), { start: 5, end: 5, insert: '></span>', cursor: 6 });
  assert.equal(getTagAutoCloseEdit('<br', 3), null);
});

test('tag completion is suppressed inside Markdown code and HTML comments', () => {
  const fenced = '```html\n<sp';
  assert.equal(isInsideMarkdownCode(fenced, fenced.length), true);
  assert.equal(getTagCompletionContext(fenced, fenced.length), null);
  const inline = '`<sp';
  assert.equal(getTagCompletionContext(inline, inline.length), null);
  const comment = '<!-- <sp';
  assert.equal(getTagCompletionContext(comment, comment.length), null);
});

test('paired delimiters insert pairs, wrap selections, and skip existing closers', () => {
  assert.deepEqual(getPairedDelimiterEdit('ab', 1, 1, '('), { start: 1, end: 1, insert: '()', cursor: 2 });
  assert.deepEqual(getPairedDelimiterEdit('selected', 0, 8, '['), { start: 0, end: 8, insert: '[selected]', cursor: 10 });
  assert.deepEqual(getPairedDelimiterEdit('""', 1, 1, '"'), { skip: true, cursor: 2 });
  assert.deepEqual(getPairedDelimiterEdit(')', 0, 0, ')'), { skip: true, cursor: 1 });
});
