/** Lightweight HTML tag completion and delimiter pairing for AetherText's native textarea. */
export const HTML_TAGS = [
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote', 'body',
  'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'data', 'datalist', 'dd', 'del', 'details', 'dfn',
  'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
  'label', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol',
  'option', 'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script',
  'search', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u',
  'ul', 'var', 'video', 'wbr',
].filter((tag, index, all) => all.indexOf(tag) === index);

export const VOID_HTML_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
export const DELIMITER_PAIRS = Object.freeze({ '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' });

/** Avoid offering markup completions inside fenced or inline Markdown code. */
export function isInsideMarkdownCode(text, cursor = String(text ?? '').length) {
  const input = String(text ?? '');
  const before = input.slice(0, Math.max(0, cursor));
  const lines = before.split('\n');
  let fence = null;
  for (const line of lines.slice(0, -1)) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (!match) continue;
    const marker = match[1][0];
    if (fence === null) fence = marker;
    else if (fence === marker) fence = null;
  }
  if (fence !== null) return true;
  const currentLine = lines.at(-1) || '';
  // An odd number of unescaped backticks before the cursor means inline code is open.
  const backticks = currentLine.match(/(?<!\\)`/g) || [];
  if (backticks.length % 2 === 1) return true;
  const commentOpen = before.lastIndexOf('<!--');
  return commentOpen > before.lastIndexOf('-->');
}

/** Returns the unfinished `<tag` or `</tag` token immediately before the caret. */
export function getTagCompletionContext(text, cursor = String(text ?? '').length) {
  const input = String(text ?? '');
  const position = Math.max(0, Math.min(input.length, cursor));
  const before = input.slice(0, position);
  if (isInsideMarkdownCode(input, position)) return null;
  const match = before.match(/<(\/?)((?:[a-z][\w:-]*)?)$/i);
  if (!match) return null;
  if (match.index > 0 && before[match.index - 1] === '\\') return null;
  return { start: match.index, end: position, prefix: match[2].toLowerCase(), closing: match[1] === '/' };
}

export function suggestHTMLTags(prefix = '', closing = false, limit = 9) {
  const needle = String(prefix).toLowerCase();
  return HTML_TAGS
    .filter((tag) => tag.startsWith(needle) && (!closing || !VOID_HTML_TAGS.has(tag)))
    .sort((a, b) => {
      // Keep common tags near the top when the user just typed `<`.
      const common = ['div', 'span', 'p', 'a', 'section', 'strong', 'h2', 'ul', 'li', 'style'];
      if (!needle) return (common.indexOf(a) < 0 ? 999 : common.indexOf(a)) - (common.indexOf(b) < 0 ? 999 : common.indexOf(b)) || a.localeCompare(b);
      return a.localeCompare(b);
    })
    .slice(0, Math.max(1, limit));
}

/** Inspect the opening tag immediately before the caret, when the user is about to type `>`. */
export function getOpenTagBeforeCursor(text, cursor = String(text ?? '').length) {
  const input = String(text ?? '');
  const position = Math.max(0, Math.min(input.length, cursor));
  const before = input.slice(0, position);
  if (isInsideMarkdownCode(input, position)) return null;
  const match = before.match(/<([a-z][\w:-]*)(?:\s+[^<>]*)?$/i);
  if (!match || match[0].startsWith('</')) return null;
  const tag = match[1].toLowerCase();
  const openingFragment = before.slice(position - match[0].length);
  // Don't treat `>` inside an unfinished quoted attribute value as the tag terminator.
  for (const quote of ['"', "'"]) {
    const quoteCount = [...openingFragment].filter((character, index) => character === quote && openingFragment[index - 1] !== '\\').length;
    if (quoteCount % 2 === 1) return null;
  }
  if (VOID_HTML_TAGS.has(tag)) return null;
  // An unfinished self-closing tag does not need an end tag.
  if (/\/\s*$/.test(match[0])) return null;
  return { tag, start: position - match[0].length, end: position };
}

export function completeTagToken(text, context, tagName) {
  const input = String(text ?? '');
  if (!context || !HTML_TAGS.includes(String(tagName).toLowerCase())) return { text: input, cursor: context?.end ?? input.length };
  const tag = String(tagName).toLowerCase();
  const opening = `<${context.closing ? '/' : ''}${tag}>`;
  const addition = !context.closing && !VOID_HTML_TAGS.has(tag) ? `</${tag}>` : '';
  const insertion = opening + addition;
  const next = input.slice(0, context.start) + insertion + input.slice(context.end);
  return { text: next, cursor: context.start + opening.length };
}

export function getTagAutoCloseEdit(text, cursor = String(text ?? '').length, afterText = '') {
  const input = String(text ?? '');
  const context = getOpenTagBeforeCursor(input, cursor);
  if (!context) return null;
  const after = afterText || input.slice(cursor);
  const existingClose = new RegExp(`^\\s*</${context.tag}\\s*>`, 'i').test(after.replace(/^>/, ''));
  if (after.startsWith('>')) {
    const closeTag = `</${context.tag}>`;
    const insertion = existingClose ? '' : closeTag;
    return { start: cursor, end: cursor + 1, insert: `>${insertion}`, cursor: cursor + 1 };
  }
  const closeTag = `</${context.tag}>`;
  const insertion = existingClose ? '>' : `>${closeTag}`;
  return { start: cursor, end: cursor, insert: insertion, cursor: cursor + 1 };
}

export function getPairedDelimiterEdit(text, start, end, key) {
  const input = String(text ?? '');
  const openers = Object.keys(DELIMITER_PAIRS);
  const closers = new Set(Object.values(DELIMITER_PAIRS));
  if (start === end && closers.has(key) && input[start] === key) return { skip: true, cursor: start + 1 };
  if (start !== end) {
    if (!openers.includes(key)) return null;
    const selected = input.slice(start, end);
    const insert = `${key}${selected}${DELIMITER_PAIRS[key]}`;
    return { start, end, insert, cursor: start + insert.length };
  }
  if (openers.includes(key)) return { start, end, insert: `${key}${DELIMITER_PAIRS[key]}`, cursor: start + 1 };
  return null;
}
