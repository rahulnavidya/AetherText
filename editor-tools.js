/** Lightweight, dependency-free editor helpers used by AetherText. */
export const SEARCH_LIMIT = 10000;

export function createSearchRegex(query, options = {}) {
  const value = String(query ?? '');
  if (!value) return null;
  const { regex = false, caseSensitive = false, wholeWord = false } = options;
  let pattern = regex ? value : value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) pattern = `\\b(?:${pattern})\\b`;
  try {
    return new RegExp(pattern, `g${caseSensitive ? '' : 'i'}`);
  } catch (error) {
    const wrapped = new Error(error.message || 'Invalid regular expression.');
    wrapped.name = 'InvalidSearchPatternError';
    throw wrapped;
  }
}

export function findOccurrences(text, query, options = {}) {
  const input = String(text ?? '');
  const expression = createSearchRegex(query, options);
  if (!expression) return [];
  const matches = [];
  let match;
  while ((match = expression.exec(input)) && matches.length < SEARCH_LIMIT) {
    matches.push({ index: match.index, length: match[0].length, text: match[0], captures: [...match].slice(1) });
    // Avoid an infinite loop for expressions that can match an empty string.
    if (match[0].length === 0) expression.lastIndex += 1;
  }
  return matches;
}

function expandReplacement(template, match, input, options = {}) {
  let value = String(template ?? '');
  if (options.regex) {
    value = value.replace(/\$([$&`']|\d{1,2})/g, (token, code) => {
      if (code === '$') return '$';
      if (code === '&') return match.text;
      if (code === '`') return input.slice(0, match.index);
      if (code === "'") return input.slice(match.index + match.length);
      const captureIndex = Number(code) - 1;
      const capture = match.captures[captureIndex];
      if (capture !== undefined) return capture;
      if (code.length === 2 && Number(code[0]) > 0 && match.captures[Number(code[0]) - 1] !== undefined) {
        return `${match.captures[Number(code[0]) - 1]}${code[1]}`;
      }
      return token;
    });
  }
  return value;
}

export function replaceOccurrenceAt(text, query, replacement, options = {}, startIndex = 0) {
  const input = String(text ?? '');
  const match = findOccurrences(input, query, options).find((item) => item.index === startIndex);
  if (!match) return { text: input, count: 0 };
  const value = expandReplacement(replacement, match, input, options);
  return {
    text: `${input.slice(0, match.index)}${value}${input.slice(match.index + match.length)}`,
    count: 1,
    replacementLength: value.length,
    match,
  };
}

export function replaceOccurrences(text, query, replacement, options = {}, all = true) {
  const input = String(text ?? '');
  const matches = findOccurrences(input, query, options);
  const chosen = all ? matches : matches.slice(0, 1);
  if (!chosen.length) return { text: input, count: 0 };
  // Work backwards so earlier offsets remain valid, while replacement tokens use the original source text.
  let output = input;
  for (const match of [...chosen].reverse()) {
    const value = expandReplacement(replacement, match, input, options);
    output = `${output.slice(0, match.index)}${value}${output.slice(match.index + match.length)}`;
  }
  return { text: output, count: chosen.length };
}

export const SNIPPETS = [
  { id: 'callout', category: 'Markdown', label: 'Callout / note', description: 'A simple highlighted note', text: '> **Note:** Write your note here.' },
  { id: 'task-list', category: 'Markdown', label: 'Task checklist', description: 'Three actionable checklist items', text: '- [ ] First task\n- [ ] Second task\n- [ ] Third task' },
  { id: 'table', category: 'Markdown', label: 'Comparison table', description: 'A clean three-column table', text: '| Feature | Details | Status |\n| --- | --- | --- |\n| Example | Add details | Planned |' },
  { id: 'details', category: 'HTML', label: 'Collapsible details', description: 'A native expandable section', text: '<details>\n  <summary>More details</summary>\n\n  Add the expanded content here.\n</details>' },
  { id: 'card', category: 'HTML', label: 'Content card', description: 'A reusable card for themed previews', text: '<section class="card">\n  <h2>Card title</h2>\n  <p>Add your content here.</p>\n</section>' },
  { id: 'directory', category: 'HTML', label: 'Directory section', description: 'A section suited to link collections', text: '<section class="directory">\n  <h2>Directory</h2>\n  <p class="directory-count">Collection · 0 items</p>\n  <ul>\n    <li><a href="https://example.com">Example link</a></li>\n  </ul>\n</section>' },
  { id: 'status', category: 'HTML', label: 'Status badges', description: 'Small status and quality labels', text: '<span class="tag">STATUS</span> <span class="quality">HQ</span> <span class="meta">NOTE</span>' },
  { id: 'css-starter', category: 'CSS', label: 'CSS starter block', description: 'A small custom document stylesheet', text: '<style>\n:root {\n  --surface: #171923;\n  --ink: #f4f5f7;\n  --accent: #66d9ff;\n}\n\nbody {\n  background: var(--surface);\n  color: var(--ink);\n  font-family: system-ui, sans-serif;\n  line-height: 1.7;\n}\n\na { color: var(--accent); }\n</style>' },
];

export const VIEWPORTS = [
  { id: 'responsive', label: 'Responsive', width: '100%' },
  { id: 'desktop', label: 'Desktop · 1280 px', width: 1280 },
  { id: 'laptop', label: 'Laptop · 1024 px', width: 1024 },
  { id: 'tablet', label: 'Tablet · 768 px', width: 768 },
  { id: 'mobile', label: 'Mobile · 390 px', width: 390 },
];

export function safeHTMLFilename(name = 'Untitled.md') {
  const base = String(name).trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').replace(/\.+$/, '').slice(0, 110) || 'Untitled';
  return `${base.replace(/\.(?:md|mdown|markdown|html?)$/i, '') || 'Untitled'}.html`;
}
