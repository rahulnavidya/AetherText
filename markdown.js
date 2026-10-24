/* AetherText MicroMarkdown: a small, dependency-free Markdown subset parser.
   Raw HTML is deliberately escaped in normal mode; browser mode preserves safe author markup. */
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function safeURL(value, image = false) {
  const raw = String(value || '').trim().replace(/&#x([\da-f]+);?/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);?/g, (_, code) => String.fromCodePoint(Number(code)));
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return raw;
  try {
    const baseURL = typeof location !== 'undefined' ? location.href : 'https://aethertext.invalid/';
    const url = new URL(raw, baseURL);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    if (!image && url.protocol === 'mailto:') return url.href;
  } catch { /* leave unsafe URL blocked */ }
  return null;
}

function tokeniseHTML(parts, html) {
  const token = `\u0001${parts.length}\u0002`;
  parts.push(html);
  return token;
}

function emptyLinkPlaceholder() {
  // An intentionally empty archive entry should still look like a useful link tile.
  // The user's CSS can style the anchor and its .quality badge normally.
  return '<a class="aether-empty-link" role="img" aria-label="Empty link placeholder"><span class="quality">HQ</span></a>';
}

function normalizeBrokenMarkdownLinks(source) {
  // Repair common editor/export formatting such as:
  // - [
  //   Link label](https://example.com)
  // Keep fenced code byte-for-byte intact.
  const text = String(source).replace(/\r\n?/g, '\n');
  const fencedBlock = /(^[ \t]{0,3}(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*$)/gm;
  const segments = text.split(fencedBlock);
  return segments.map((segment, index) => {
    if (index % 2 === 1) return segment;
    return segment.replace(/\[((?:[^\[\]]|\[[^\[\]]*\]){0,600}?)\]\s*\(\s*([^\s)]*)\s*\)/gs, (match, rawLabel, rawURL) => {
      const label = rawLabel.replace(/\s+/g, ' ').trim();
      const url = rawURL.trim();
      if (!match.includes('\n') && rawLabel === label && rawURL === url) return match;
      return `[${label}](${url})`;
    });
  }).join('');
}

function renderInline(source, depth = 0, allowRawHTML = false, inheritedParts = null) {
  if (depth > 6) return escapeHTML(source);
  const parts = inheritedParts ? [...inheritedParts] : [];
  let text = String(source);

  // Protect inline code first so markdown punctuation inside it remains literal.
  text = text.replace(/(`+)([^\n]*?)\1(?!`)/g, (_, ticks, code) => tokeniseHTML(parts, `<code>${escapeHTML(code)}</code>`));

  // Empty links are common placeholders in long-running archive documents.
  // Render them as intentional, CSS-styleable tiles rather than literal []() text.
  if (allowRawHTML) {
    text = text.replace(/(^|[^!])\[\s*\]\(\s*\)/g, (match, prefix) => `${prefix}${tokeniseHTML(parts, emptyLinkPlaceholder())}`);
  }

  // Links and images only accept safe schemes. Nested parentheses in URL syntax aren't supported.
  const linkPattern = /(!?)\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*([^\s)]*)(?:\s+"([^"]*)")?\s*\)/g;
  text = text.replace(linkPattern, (match, bang, label, destination, title) => {
    const destinationText = destination.trim();
    const url = safeURL(destinationText, bang === '!');
    if (bang === '!') {
      if (!url) return label;
      const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
      return tokeniseHTML(parts, `<img src="${escapeHTML(url)}" alt="${escapeHTML(label)}"${titleAttr} loading="lazy" decoding="async" referrerpolicy="no-referrer">`);
    }
    const isEmptyLabel = !label.trim();
    const inner = isEmptyLabel && allowRawHTML
      ? '<span class="quality">HQ</span>'
      : renderInline(label, depth + 1, allowRawHTML, parts);
    if (!destinationText && allowRawHTML) {
      if (isEmptyLabel) return tokeniseHTML(parts, emptyLinkPlaceholder());
      return tokeniseHTML(parts, `<a class="aether-empty-link" role="note" aria-label="Link destination missing">${inner}<span class="quality">HQ</span></a>`);
    }
    if (!url) {
      if (isEmptyLabel && allowRawHTML) return tokeniseHTML(parts, emptyLinkPlaceholder());
      return tokeniseHTML(parts, inner);
    }
    const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
    const classAttr = isEmptyLabel && allowRawHTML ? ' class="aether-empty-link"' : '';
    return tokeniseHTML(parts, `<a href="${escapeHTML(url)}"${classAttr}${titleAttr} target="_blank" rel="noopener noreferrer">${inner}</a>`);
  });


  // Browser mode preserves ordinary inline HTML so classes and semantic tags can
  // be styled by a document's own CSS. The final sandbox renderer removes scripts
  // and unsafe attributes before assigning the document to its iframe.
  if (allowRawHTML) {
    const rawTag = /<\/?[a-z][a-z0-9:-]*(?:\s+[^<>]*?)?\s*\/?>/gi;
    text = text.replace(rawTag, (tag) => tokeniseHTML(parts, tag));
  }

  text = escapeHTML(text);
  text = text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');
  text = text.replace(/ {2,}\n/g, ' <br>\n').replace(/\n/g, '<br>\n');

  return text.replace(/\u0001(\d+)\u0002/g, (match, index) => parts[Number(index)] ?? match);
}

function startsBlock(lines, index, allowRawHTML = false) {
  const line = lines[index] ?? '';
  if (!line.trim()) return true;
  if (allowRawHTML && /^ {0,3}<(?:\/?[a-z][\w:-]*(?:\s|\/?>)|!--|!doctype\b)/i.test(line)) return true;
  if (/^ {0,3}(#{1,6})\s+/.test(line)) return true;
  if (/^ {0,3}(```+|~~~+)/.test(line)) return true;
  if (/^ {0,3}>/.test(line)) return true;
  if (/^ {0,3}([-*_]\s*){3,}$/.test(line)) return true;
  if (/^\s{0,3}([-+*]|\d+[.)])\s+/.test(line)) return true;
  if (index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) return true;
  return false;
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function parseList(lines, start, ordered, allowRawHTML = false) {
  const tag = ordered ? 'ol' : 'ul';
  const itemPattern = ordered ? /^\s{0,3}\d+[.)]\s+(.*)$/ : /^\s{0,3}[-+*]\s+(.*)$/;
  const items = [];
  let i = start;
  let hasTasks = false;
  while (i < lines.length) {
    const match = lines[i].match(itemPattern);
    if (!match) break;
    let item = match[1];
    const task = item.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      hasTasks = true;
      item = `<input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}> ${renderInline(task[2], 0, allowRawHTML)}`;
    } else {
      item = renderInline(item, 0, allowRawHTML);
    }
    items.push(`<li>${item}</li>`);
    i++;
  }
  if (!items.length) return { html: '', next: start };
  return { html: `<${tag}${hasTasks ? ' class="task-list"' : ''}>${items.join('')}</${tag}>`, next: i };
}

function parseMarkdown(source, depth = 0, allowRawHTML = false) {
  if (depth > 5) return `<p>${renderInline(source, 0, allowRawHTML)}</p>`;
  const preparedSource = allowRawHTML ? normalizeBrokenMarkdownLinks(source) : String(source);
  const lines = preparedSource.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Standalone HTML tags/comments are structure, not Markdown paragraph text.
    // This branch is only enabled for the isolated browser-preview sandbox.
    if (allowRawHTML && /^ {0,3}<(?:\/?[a-z][\w:-]*(?:\s|\/?>)|!--|!doctype\b)/i.test(line)) {
      output.push(line);
      i++;
      continue;
    }

    const fence = line.match(/^ {0,3}(```+|~~~+)\s*([\w.+#-]*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const language = fence[2] ? ` class="language-${escapeHTML(fence[2])}"` : '';
      i++;
      const code = [];
      while (i < lines.length && !new RegExp(`^ {0,3}${marker}{3,}\\s*$`).test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      output.push(`<pre><code${language}>${escapeHTML(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+\s*)?$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2].trim(), 0, allowRawHTML)}</h${level}>`);
      i++;
      continue;
    }

    if (/^ {0,3}([-*_]\s*){3,}$/.test(line)) {
      output.push('<hr>'); i++; continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) quoteLines.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      output.push(`<blockquote>${parseMarkdown(quoteLines.join('\n'), depth + 1, allowRawHTML)}</blockquote>`);
      continue;
    }

    const unordered = /^\s{0,3}[-+*]\s+/.test(line);
    const ordered = /^\s{0,3}\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const result = parseList(lines, i, ordered, allowRawHTML);
      output.push(result.html);
      i = result.next > i ? result.next : i + 1;
      continue;
    }

    if (i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const headers = splitTableRow(line);
      const alignment = splitTableRow(lines[i + 1]).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i++]));
      }
      const headHTML = headers.map((cell, index) => `<th class="align-${alignment[index] || 'left'}">${renderInline(cell, 0, allowRawHTML)}</th>`).join('');
      const bodyHTML = rows.map((row) => `<tr>${headers.map((_, index) => `<td class="align-${alignment[index] || 'left'}">${renderInline(row[index] || '', 0, allowRawHTML)}</td>`).join('')}</tr>`).join('');
      output.push(`<table><thead><tr>${headHTML}</tr></thead><tbody>${bodyHTML}</tbody></table>`);
      continue;
    }

    // Indented code blocks.
    if (/^( {4}|\t)/.test(line)) {
      const code = [];
      while (i < lines.length && (/^( {4}|\t)/.test(lines[i]) || !lines[i].trim())) {
        code.push(lines[i].replace(/^( {4}|\t)/, ''));
        i++;
      }
      while (code.length && !code[code.length - 1]) code.pop();
      output.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`);
      continue;
    }

    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && !startsBlock(lines, i, allowRawHTML)) paragraph.push(lines[i++].trim());
    output.push(`<p>${renderInline(paragraph.join('\n'), 0, allowRawHTML)}</p>`);
  }
  return output.join('\n');
}

export function renderMarkdown(source) {
  return parseMarkdown(source);
}

/** Render a Markdown/HTML hybrid for the sandboxed browser preview. */
export function renderMarkdownBrowser(source) {
  return parseMarkdown(source, 0, true);
}
