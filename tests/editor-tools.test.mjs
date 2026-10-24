import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchRegex, findOccurrences, replaceOccurrences, replaceOccurrenceAt, safeHTMLFilename, SNIPPETS, VIEWPORTS } from '../editor-tools.js';

test('literal search treats punctuation as text and defaults to case-insensitive', () => {
  assert.deepEqual(findOccurrences('Hello (world) and hello (world)', '(world)'), [
    { index: 6, length: 7, text: '(world)', captures: [] },
    { index: 24, length: 7, text: '(world)', captures: [] },
  ]);
});

test('case-sensitive, whole-word, and regular-expression search options work', () => {
  assert.equal(findOccurrences('cat Cat scatter', 'cat', { caseSensitive: true, wholeWord: true }).length, 1);
  assert.equal(findOccurrences('cat Cat scatter', 'cat', { wholeWord: true }).length, 2);
  assert.equal(findOccurrences('item-42 item-7', 'item-(\\d+)', { regex: true }).length, 2);
  assert.throws(() => createSearchRegex('(', { regex: true }), { name: 'InvalidSearchPatternError' });
});

test('replacement supports one/all matches and regex capture substitutions', () => {
  assert.deepEqual(replaceOccurrences('cat cat cat', 'cat', 'dog', {}, false), { text: 'dog cat cat', count: 1 });
  assert.deepEqual(replaceOccurrences('cat cat', 'cat', 'dog', {}, true), { text: 'dog dog', count: 2 });
  assert.deepEqual(replaceOccurrences('item-12 item-7', 'item-(\\d+)', '[$1]', { regex: true }, true), { text: '[12] [7]', count: 2 });
  assert.deepEqual(replaceOccurrences('cat', 'dog', 'fox'), { text: 'cat', count: 0 });
});

test('empty queries and zero-length regex cannot spin indefinitely', () => {
  assert.deepEqual(findOccurrences('abc', ''), []);
  assert.ok(findOccurrences('abc', '(?=.)', { regex: true }).length <= 3);
});


test('replace-one honors regex context and captures from the full document', () => {
  const source = 'prefix abc suffix';
  const match = findOccurrences(source, '(?<=prefix )([a-z]+)', { regex: true })[0];
  const result = replaceOccurrenceAt(source, '(?<=prefix )([a-z]+)', '$1-$`', { regex: true }, match.index);
  assert.equal(result.count, 1);
  assert.equal(result.text, 'prefix abc-prefix  suffix');
  assert.equal(result.replacementLength, 'abc-prefix '.length);
});

test('the snippet library includes Markdown, HTML, and CSS starters', () => {
  assert.ok(SNIPPETS.some((item) => item.category === 'Markdown'));
  assert.ok(SNIPPETS.some((item) => item.category === 'HTML' && item.text.includes('<details>')));
  assert.ok(SNIPPETS.some((item) => item.category === 'CSS' && item.text.includes('<style>')));
  assert.deepEqual(VIEWPORTS.map((item) => item.id), ['responsive', 'desktop', 'laptop', 'tablet', 'mobile']);
});

test('HTML filename sanitizes path characters and markdown extensions', () => {
  assert.equal(safeHTMLFilename('../notes.md'), '-notes.html');
  assert.equal(safeHTMLFilename('vault.html'), 'vault.html');
});
