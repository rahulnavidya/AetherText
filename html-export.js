import { buildBrowserDocument } from './browser-preview.js';

function getAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag).match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function rewriteCssResourceUrls(css, stylesheetURL) {
  return String(css).replace(/url\(\s*(["']?)(?!data:|blob:|https?:|file:|#)([^)'"\s]+)\1\s*\)/gi, (whole, quote, path) => {
    try { return `url("${new URL(path, stylesheetURL).href.replace(/"/g, '%22')}")`; }
    catch { return whole; }
  });
}

async function inlineCssImports(css, stylesheetURL, fetchImpl, unresolved, visited = new Set(), depth = 0) {
  if (depth >= 4) return rewriteCssResourceUrls(css, stylesheetURL);
  const rules = [...String(css).matchAll(/@import\s+(?:url\(\s*)?(["']?)([^)'"\s;]+)\1\s*\)?\s*([^;]*);/gi)];
  let output = String(css);
  for (const rule of rules) {
    const rawPath = rule[2];
    const media = rule[3]?.trim() || '';
    if (/^(?:data:|blob:|file:)/i.test(rawPath)) { unresolved.push(rawPath); continue; }
    let absolute;
    try { absolute = new URL(rawPath, stylesheetURL).href; } catch { unresolved.push(rawPath); continue; }
    if (visited.has(absolute)) { unresolved.push(absolute); continue; }
    try {
      const response = await fetchImpl(absolute, { credentials: 'same-origin' });
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
      const nextVisited = new Set(visited); nextVisited.add(absolute);
      let imported = await inlineCssImports(await response.text(), absolute, fetchImpl, unresolved, nextVisited, depth + 1);
      imported = rewriteCssResourceUrls(imported, absolute);
      if (media) imported = `@media ${media} {\n${imported}\n}`;
      output = output.replace(rule[0], `/* inlined @import: ${absolute} */\n${imported}`);
    } catch {
      unresolved.push(absolute);
      output = output.replace(rule[0], `@import url("${absolute.replace(/"/g, '%22')}")${media ? ` ${media}` : ''};`);
    }
  }
  return rewriteCssResourceUrls(output, stylesheetURL);
}

/** Build an export HTML document and inline linked CSS when the browser can fetch it. */
export async function buildStandaloneHTML(source, options = {}) {
  const baseURL = options.baseURL || 'http://localhost/';
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  let html = buildBrowserDocument(source, options);
  const stylesheetTags = html.match(/<link\b(?=[^>]*\brel\s*=\s*(?:["'][^"']*\bstylesheet\b[^"']*["']|stylesheet\b))[^>]*>/gi) || [];
  const unresolved = [];
  for (const tag of stylesheetTags) {
    const href = getAttribute(tag, 'href');
    if (!href || !fetchImpl) { unresolved.push(href || '(stylesheet without href)'); continue; }
    let absolute;
    try { absolute = new URL(href, baseURL).href; } catch { unresolved.push(href); continue; }
    try {
      const response = await fetchImpl(absolute, { credentials: 'same-origin' });
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
      const css = (await inlineCssImports(await response.text(), absolute, fetchImpl, unresolved, new Set([absolute]))).replace(/<\/style/gi, '<\\/style');
      html = html.replace(tag, `<style data-aether-inlined-from="${absolute.replace(/"/g, '&quot;')}">\n${css}\n</style>`);
    } catch {
      unresolved.push(absolute);
      // Preserve the stylesheet as an absolute URL rather than silently stripping its styling.
      html = html.replace(tag, tag.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `href="${absolute.replace(/"/g, '&quot;')}"`));
    }
  }
  // Resolve relative assets/imports in authored and generated inline CSS as far as possible.
  const styleBlocks = html.match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi) || [];
  for (const block of styleBlocks) {
    const openEnd = block.indexOf('>') + 1;
    const closeStart = block.toLowerCase().lastIndexOf('</style');
    if (openEnd <= 0 || closeStart < openEnd) continue;
    const opening = block.slice(0, openEnd);
    const css = await inlineCssImports(block.slice(openEnd, closeStart), baseURL, fetchImpl, unresolved, new Set());
    const rebuilt = `${opening}${css.replace(/<\/style/gi, '<\\/style')}${block.slice(closeStart)}`;
    html = html.replace(block, rebuilt);
  }
  // The host/preview scroll bridge has no job in a downloaded standalone page.
  html = html.replace(/<script>\s*\(\(\)\s*=>\s*\{[\s\S]*?aetherTextPreview[\s\S]*?<\/script>/i, '');
  return { html: html.replace(/\s*data-aether-inlined-from="[^"]*"/g, ''), unresolvedStylesheets: unresolved };
}
