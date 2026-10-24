import { renderMarkdownBrowser } from './markdown.js';
import { getFileType, supportsMarkupPreview } from './file-types.js';

const PREVIEW_SCROLL_BRIDGE = String.raw`<script>
(() => {
  const report = () => {
    const root = document.documentElement;
    parent.postMessage({
      aetherTextPreview: true,
      type: 'scroll',
      x: window.scrollX || 0,
      y: window.scrollY || 0,
      height: Math.max(root.scrollHeight, document.body?.scrollHeight || 0),
      viewport: window.innerHeight || root.clientHeight || 1
    }, '*');
  };
  let queued = false;
  const queueReport = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; report(); });
  };
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.aetherTextHost !== true || event.data?.type !== 'scroll-to') return;
    window.scrollTo(Number(event.data.x) || 0, Number(event.data.y) || 0);
  });
  addEventListener('scroll', queueReport, { passive: true });
  addEventListener('resize', queueReport, { passive: true });
  addEventListener('load', () => { report(); setTimeout(report, 80); }, { once: true });
  if ('ResizeObserver' in window) new ResizeObserver(queueReport).observe(document.documentElement);
})();
</script>`;

function escapeStyleText(css) {
  // Prevent an author stylesheet from closing the wrapper's style element early.
  return String(css).replace(/<\/style/gi, '<\\/style');
}

function styleTag(css) {
  return `<style>${escapeStyleText(css)}</style>`;
}

function removeUnsafeMarkup(markup, options = {}) {
  const allowScripts = options.allowScripts === true;
  const allowInlineHandlers = options.allowInlineHandlers === true;
  // Do not accidentally rewrite examples inside HTML comments while sanitizing.
  const comments = [];
  let result = String(markup).replace(/<!--[\s\S]*?-->/g, (comment) => {
    const token = `\u0000AETHER_COMMENT_${comments.length}\u0000`;
    comments.push(comment);
    return token;
  });
  if (!allowScripts) {
    result = result
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?\s*>/gi, '');
  }
  result = result
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<iframe\b[^>]*\/?\s*>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<object\b[^>]*\/?\s*>/gi, '')
    .replace(/<embed\b[^>]*\/?\s*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']?refresh\b)[^>]*>/gi, '');
  if (!allowInlineHandlers) {
    result = result.replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }
  result = result
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|xlink:href|action|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
    .replace(/\s+(href|src|xlink:href|action|formaction)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"');
  return result.replace(/\u0000AETHER_COMMENT_(\d+)\u0000/g, (_, index) => comments[Number(index)] ?? '');
}

function transformOutsideFencedCode(source, transform, preserveFenced = true) {
  const lines = String(source).split(/(?<=\n)/);
  let output = '';
  let plain = '';
  let fence = null;
  for (const line of lines) {
    const content = line.replace(/\r?\n$/, '');
    if (!fence) {
      const opening = content.match(/^ {0,3}(`{3,}|~{3,})/);
      if (opening) {
        output += transform(plain);
        plain = '';
        fence = { char: opening[1][0], length: opening[1].length };
        if (preserveFenced) output += line;
      } else {
        plain += line;
      }
      continue;
    }
    if (preserveFenced) output += line;
    const closing = content.match(/^ {0,3}(`+|~+)[ \t]*$/);
    if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) fence = null;
  }
  output += transform(plain);
  return output;
}

function isExecutableScriptTag(openingTag) {
  const typeMatch = String(openingTag).match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? '').trim().toLowerCase().split(';')[0];
  if (!type || type === 'module') return true;
  return ['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript', 'application/x-javascript', 'text/jscript'].includes(type);
}

/** Return true only when this document contains executable script or inline event code. */
export function hasDocumentJavaScript(source) {
  const outsideCode = transformOutsideFencedCode(source, (segment) => segment, false)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(`+)([\s\S]*?)\1/g, ' ');
  const openingTags = [...outsideCode.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  return openingTags.some(isExecutableScriptTag) || /\son[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(outsideCode);
}

function findInlineCodeEnd(source, delimiter, startAt) {
  let index = source.indexOf(delimiter, startAt);
  while (index >= 0) {
    const beforeIsTick = source[index - 1] === '`';
    const afterIsTick = source[index + delimiter.length] === '`';
    if (!beforeIsTick && !afterIsTick) return index + delimiter.length;
    index = source.indexOf(delimiter, index + delimiter.length);
  }
  return -1;
}

function extractScriptsFromSegment(segment, allowJavaScript, scripts) {
  let output = '';
  let index = 0;
  while (index < segment.length) {
    if (segment.startsWith('<!--', index)) {
      const close = segment.indexOf('-->', index + 4);
      const end = close < 0 ? segment.length : close + 3;
      output += segment.slice(index, end);
      index = end;
      continue;
    }
    if (segment[index] === '`') {
      let runEnd = index + 1;
      while (segment[runEnd] === '`') runEnd++;
      const delimiter = segment.slice(index, runEnd);
      const codeEnd = findInlineCodeEnd(segment, delimiter, runEnd);
      if (codeEnd >= 0) {
        output += segment.slice(index, codeEnd);
        index = codeEnd;
        continue;
      }
    }
    if (segment[index] === '<') {
      const opening = segment.slice(index).match(/^<script\b[^>]*>/i);
      if (opening) {
        const openTag = opening[0];
        const contentStart = index + openTag.length;
        const closingMatch = segment.slice(contentStart).match(/<\/script\s*>/i);
        if (!closingMatch) {
          // While the user is still typing a script, never feed an unterminated
          // element to the HTML parser. Hide the unfinished block until closed.
          output += segment.slice(index).replace(/^<script\b[^>]*>[\s\S]*$/i, '');
          break;
        }
        const end = contentStart + closingMatch.index + closingMatch[0].length;
        const script = segment.slice(index, end);
        if (allowJavaScript) {
          const token = `\n\n<!--AETHER_SCRIPT_BLOCK_${scripts.length}-->\n\n`;
          scripts.push(script);
          output += token;
        } else {
          output += '\n\n';
        }
        index = end;
        continue;
      }
      const selfClosing = segment.slice(index).match(/^<script\b[^>]*\/\s*>/i);
      if (selfClosing) {
        if (allowJavaScript) {
          const token = `\n\n<!--AETHER_SCRIPT_BLOCK_${scripts.length}-->\n\n`;
          scripts.push(selfClosing[0]);
          output += token;
        } else {
          output += '\n\n';
        }
        index += selfClosing[0].length;
        continue;
      }
    }
    output += segment[index];
    index++;
  }
  return output;
}

function extractAuthorScripts(source, allowJavaScript) {
  const scripts = [];
  const processed = transformOutsideFencedCode(source, (segment) => extractScriptsFromSegment(segment, allowJavaScript, scripts));
  return { source: processed, scripts };
}

function replaceScriptPlaceholders(markup, scripts) {
  let result = String(markup);
  scripts.forEach((script, index) => {
    const token = `AETHER_SCRIPT_BLOCK_${index}`;
    result = result.replace(new RegExp(`(?:<p>\\s*)?<!--${token}-->(?:\\s*<\\/p>)?`, 'gi'), script);
    result = result.replace(new RegExp(`(?:<p>\\s*)?&lt;!--${token}--&gt;(?:\\s*<\\/p>)?`, 'gi'), script);
  });
  return result;
}

function addBridgeToCompleteDocument(documentText, allowJavaScript = false) {
  let result = removeUnsafeMarkup(documentText, { allowScripts: allowJavaScript, allowInlineHandlers: allowJavaScript });
  if (/<\/body\s*>/i.test(result)) {
    return result.replace(/<\/body\s*>/i, `${PREVIEW_SCROLL_BRIDGE}</body>`);
  }
  if (/<\/html\s*>/i.test(result)) {
    return result.replace(/<\/html\s*>/i, `${PREVIEW_SCROLL_BRIDGE}</html>`);
  }
  return `${result}${PREVIEW_SCROLL_BRIDGE}`;
}

function extractStyles(source) {
  const styles = [];
  const stylesheets = [];
  const withoutStyles = String(source).replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css) => {
    const token = `<!--AETHER_STYLE_BLOCK_${styles.length}-->`;
    styles.push(css);
    return `\n\n${token}\n\n`;
  });
  const preparedSource = withoutStyles.replace(/<link\b(?=[^>]*\brel\s*=\s*(?:["'][^"']*\bstylesheet\b[^"']*["']|stylesheet\b))[^>]*>/gi, (link) => {
    const index = stylesheets.length;
    stylesheets.push(removeUnsafeMarkup(link));
    return `\n\n<!--AETHER_STYLESHEET_BLOCK_${index}-->\n\n`;
  });
  return { styles, stylesheets, source: preparedSource };
}

function hasRawHTMLOutsideCode(source) {
  const withoutFences = String(source).replace(/^\s{0,3}(```+|~~~+)[^\n]*\n[\s\S]*?^\s{0,3}\1\s*$/gm, '');
  return /<\/?(?:a|article|aside|b|blockquote|br|button|code|details|div|em|footer|h[1-6]|header|hr|i|img|input|label|li|link|main|nav|ol|p|section|small|span|strong|style|sub|sup|table|tbody|td|th|thead|tr|ul)\b/i.test(withoutFences);
}

/**
 * Turn Markdown/HTML/CSS source into a complete, isolated browser document.
 * Author JavaScript is stripped unless the active document explicitly opts in.
 */
function stripAuthorStyles(markup) {
  return String(markup)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<link\b(?=[^>]*\brel\s*=\s*(?:["'][^"']*\bstylesheet\b[^"']*["']|stylesheet\b))[^>]*>/gi, '')
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function buildAdaptiveCompleteDocument(source, fallbackCSS, allowJavaScript = false) {
  // In adaptive mode a complete HTML file keeps its body structure, but not its
  // head stylesheet, linked CSS, or inline style attributes. Script blocks are
  // moved after the body so they can initialize the document in this isolated frame.
  const extractedScripts = extractAuthorScripts(source, allowJavaScript);
  let safeSource = removeUnsafeMarkup(extractedScripts.source);
  const bodyMatch = safeSource.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  let content = bodyMatch?.[1];
  if (content == null) {
    content = safeSource
      .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')
      .replace(/<!doctype\s+html[^>]*>/gi, '')
      .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '');
  }
  content = removeUnsafeMarkup(stripAuthorStyles(content)).replace(/<!--AETHER_SCRIPT_BLOCK_\d+-->/gi, '').trim();
  if (!content) content = '<p class="empty-document">Your blank page is still full of possibility.</p>';
  const scriptsMarkup = allowJavaScript ? extractedScripts.scripts.join('\n') : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${styleTag(fallbackCSS)}
</head>
<body>
<main class="markdown-body aether-adaptive">${content}</main>
${scriptsMarkup}
${PREVIEW_SCROLL_BRIDGE}
</body>
</html>`;
}

function escapeHTML(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildTextSourceDocument(source, options, fileType, fallbackCSS) {
  const text = String(source ?? '');
  const escaped = escapeHTML(text);
  const title = escapeHTML(options.filename || 'Untitled.txt');
  const isCode = fileType.kind === 'code';
  const language = escapeHTML(fileType.id || 'text');
  const sourceCSS = `
html,body{min-height:100%;margin:0}
body{margin:0;padding:clamp(14px,3vw,30px);box-sizing:border-box}
.aether-source-view{max-width:1200px;min-width:0;margin:0 auto;color:var(--preview-ink,inherit);font-family:${isCode ? 'ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace' : 'inherit'};font-size:${isCode ? '13px' : '15px'};line-height:1.7}
.aether-source-view .source-kind{display:inline-flex;align-items:center;margin:0 0 12px;padding:4px 8px;border:1px solid var(--line-strong,#888);border-radius:6px;color:var(--link,#55745d);font:600 10px/1.4 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
.aether-source-view pre{margin:0;padding:clamp(14px,2.5vw,24px);overflow:auto;max-width:100%;border:1px solid var(--line-strong,#888);border-radius:10px;background:var(--code-bg,rgba(127,127,127,.08));color:var(--preview-ink,inherit);tab-size:4;white-space:${isCode ? 'pre' : 'pre-wrap'};overflow-wrap:${isCode ? 'normal' : 'anywhere'};font:inherit}
.aether-source-view code{font:inherit;white-space:inherit}
`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${styleTag(fallbackCSS)}${styleTag(sourceCSS)}</head><body><main class="aether-source-view ${isCode ? 'is-code' : 'is-plain'}"><div class="source-kind">${escapeHTML(fileType.label)}</div><pre><code class="language-${language}">${escaped}</code></pre></main>${PREVIEW_SCROLL_BRIDGE}</body></html>`;
}

/**
 * Render a document according to its filename: Markdown and HTML get a live browser
 * preview; plain text and source/config formats are escaped into a lightweight code view.
 * `file` preserves authored styles; `aether` adapts markup to the selected AetherText theme.
 * Author scripts require explicit per-document opt-in inside the sandboxed iframe.
 */
export function buildBrowserDocument(source, options = {}) {
  const text = String(source ?? '');
  const fallbackCSS = String(options.fallbackCSS ?? '');
  const previewStyle = options.previewStyle === 'aether' ? 'aether' : 'file';
  const adaptive = previewStyle === 'aether';
  const fileType = getFileType(options.filename || 'Untitled.md');
  if (fileType.kind === 'plain' || fileType.kind === 'code') {
    return buildTextSourceDocument(text, options, fileType, fallbackCSS);
  }
  // Script execution is only supported for Markdown/HTML documents and requires
  // an explicit per-document opt-in; other source files are always inert code views.
  const runJavaScript = options.runJavaScript === true && supportsMarkupPreview(options.filename || 'Untitled.md') && hasDocumentJavaScript(text);

  // Full HTML documents need a separate adaptive extraction path; otherwise the
  // original <head> would continue loading author stylesheets and ignore our theme.
  if (/^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b/i.test(text)) {
    return adaptive ? buildAdaptiveCompleteDocument(text, fallbackCSS, runJavaScript) : addBridgeToCompleteDocument(text, runJavaScript);
  }

  const extractedScripts = extractAuthorScripts(text, runJavaScript);
  const { styles, stylesheets, source: withoutStyles } = extractStyles(extractedScripts.source);
  const hasRawHTML = hasRawHTMLOutsideCode(withoutStyles) || extractedScripts.scripts.length > 0;
  const hasExternalCSS = stylesheets.length > 0;
  let bodyMarkup;

  if (fileType.kind === 'html') {
    // HTML files are treated as HTML even when the source is only a fragment; never
    // reinterpret their tag syntax or literal text as Markdown. Adaptive mode later
    // strips author styling while keeping the fragment's markup structure.
    bodyMarkup = withoutStyles || '<p class="empty-document">Your blank page is still full of possibility.</p>';
  } else if (adaptive) {
    // Parse Markdown as usual, but deliberately do not carry file CSS into output.
    bodyMarkup = renderMarkdownBrowser(withoutStyles) || '<p class="empty-document">Your blank page is still full of possibility.</p>';
  } else if (hasRawHTML) {
    bodyMarkup = renderMarkdownBrowser(withoutStyles);
  } else {
    // Markdown-only previews can still use the simple browser fallback stylesheet.
    const rendered = renderMarkdownBrowser(withoutStyles);
    bodyMarkup = `<main class="markdown-body">${rendered || '<p class="empty-document">Your blank page is still full of possibility.</p>'}</main>`;
  }

  bodyMarkup = bodyMarkup
    .replace(/<p>\s*&lt;!--AETHER_(?:STYLE|STYLESHEET)_BLOCK_\d+--&gt;\s*<\/p>/gi, '')
    .replace(/&lt;!--AETHER_(?:STYLE|STYLESHEET)_BLOCK_\d+--&gt;/gi, '')
    .replace(/<!--AETHER_(?:STYLE|STYLESHEET)_BLOCK_\d+-->/gi, '');
  bodyMarkup = replaceScriptPlaceholders(bodyMarkup, extractedScripts.scripts);
  bodyMarkup = removeUnsafeMarkup(bodyMarkup, { allowScripts: runJavaScript, allowInlineHandlers: runJavaScript });
  if (adaptive) {
    bodyMarkup = stripAuthorStyles(bodyMarkup);
    bodyMarkup = `<main class="markdown-body aether-adaptive">${bodyMarkup || '<p class="empty-document">Your blank page is still full of possibility.</p>'}</main>`;
  }

  // File CSS mode honors styles embedded/linked by the document. Adaptive mode
  // always injects theme CSS and omits all source stylesheet blocks entirely.
  const baseCSS = adaptive
    ? fallbackCSS
    : (styles.length || hasExternalCSS) ? 'html,body{min-height:100%;}body{margin:0;}' : fallbackCSS;
  const authorStyles = adaptive ? '' : styles.map(styleTag).join('\n');
  const authorStylesheets = adaptive ? '' : stylesheets.join('\n');
  // Low-specificity safety net for intentionally empty archive entries.
  const emptyLinkCSS = `
:where(a.aether-empty-link){display:inline-flex;align-items:center;justify-content:space-between;gap:26px;min-width:220px;min-height:50px;padding:8px 22px;border-radius:20px;background:rgba(255,255,255,.05);text-decoration:none;vertical-align:middle;cursor:default}
:where(a.aether-empty-link)::before{content:"LINK";display:inline-block;padding:5px 14px;border:1px solid rgba(0,255,136,.4);border-radius:999px;background:rgba(0,255,136,.12);color:#00ff88;font:700 11px/1.5 system-ui,sans-serif;letter-spacing:1px;box-shadow:0 0 10px rgba(0,255,136,.2)}
:where(a.aether-empty-link .quality){display:inline-block;padding:3px 9px;border:1px solid rgba(102,217,255,.35);border-radius:999px;background:rgba(102,217,255,.12);color:#66d9ff;font:700 .85em/1.5 system-ui,sans-serif}
`;
  const documentHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${styleTag(baseCSS)}
${styleTag(emptyLinkCSS)}
${authorStylesheets}
${authorStyles}
</head>
<body>
${bodyMarkup}
${PREVIEW_SCROLL_BRIDGE}
</body>
</html>`;
  return documentHTML;
}

function createAdaptiveContentStyles(theme) {
  const {
    id: themeID = 'classic-writer', appearance = 'light', background: bg = '#fffefa',
    ink = '#363732', heading = '#292a28', link = '#55745d', codeBackground: codeBg = '#f0f0e9',
    rule = '#deddd4', quote: quoteColor = '#a5b5a4', font = 'Georgia, \"Times New Roman\", serif', appFont = 'system-ui, sans-serif',
  } = theme;
  const dark = appearance === 'dark';
  const surface = `color-mix(in srgb, ${bg} 90%, ${link})`;
  const softerSurface = `color-mix(in srgb, ${bg} 95%, ${link})`;
  let css = `
/* AetherText adaptive document skin: document CSS and inline styles are suppressed. */
.aether-adaptive{width:100%;max-width:960px;margin-inline:auto;min-width:0}
.aether-adaptive :where(img,video,svg,canvas){max-width:100%;height:auto}
.aether-adaptive :where(p,li,td,th,dd,dt,blockquote,figcaption){overflow-wrap:anywhere}
.aether-adaptive :where(.card,.repository-card,.directory,.status-card,.stats-card,.active,.completed,.repository-note){position:relative;min-width:0;margin:1.25em 0;padding:clamp(16px,2.8vw,28px);border:1px solid ${rule};border-inline-start:4px solid ${link};border-radius:14px;background:${surface};box-shadow:0 8px 25px color-mix(in srgb, ${ink} 7%, transparent);overflow-wrap:anywhere}
.aether-adaptive :where(.card,.repository-card,.directory,.status-card,.stats-card,.active,.completed) h1:first-child,.aether-adaptive :where(.card,.repository-card,.directory,.status-card,.stats-card,.active,.completed) h2:first-child{margin-top:0}
.aether-adaptive :where(.repository-header,.directory-header,.repository-footer,.directory-info,.repository-status,.navbar){display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.aether-adaptive :where(.repository-header,.directory-header){margin-bottom:1.1em;padding-bottom:.9em;border-bottom:1px solid ${rule}}
.aether-adaptive :where(.repository-title){margin:0;font-family:${appFont};font-size:clamp(1.5rem,3.6vw,2.35rem);font-weight:800;letter-spacing:-.035em;line-height:1.1;color:${heading}}
.aether-adaptive :where(.repository-subtitle,.repository-label,.repository-footer,.directory-info,.directory-count){color:${link};font-size:.78em;letter-spacing:.07em}
.aether-adaptive :where(.repository-info,.stats,.layout){display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));gap:12px;margin:1.2em 0}
.aether-adaptive :where(.repository-item,.stats>div,.repository-note,.searchbar){min-width:0;padding:13px 15px;border:1px solid ${rule};border-radius:10px;background:${softerSurface}}
.aether-adaptive :where(.repository-label){display:block;margin-bottom:.4em;font-weight:750;text-transform:uppercase}
.aether-adaptive :where(.repository-value){display:block;color:${heading};font-size:clamp(1rem,2.5vw,1.25rem);font-weight:750;overflow-wrap:anywhere}
.aether-adaptive :where(.repository-storage,.directory-number){position:static;float:right;margin:0 0 .5em .8em;color:${link};font-size:1.5em;font-weight:800;opacity:.65}
.aether-adaptive :where(.repository-badge,.directory-label,.quality,.meta,.alert,.alerti,.tag,.combo,.repository-status span,.status-raw,.status-indexed,.status-mixed,.status-warning,.downloaded){display:inline-flex;align-items:center;gap:.35em;max-width:100%;padding:.25em .68em;border:1px solid ${rule};border-radius:999px;background:${codeBg};color:${link};font:650 .78em/1.5 ${appFont};letter-spacing:.02em;overflow-wrap:anywhere}
.aether-adaptive :where(.alert,.alerti,.alert-major,.status-warning){color:#d9384d;border-color:color-mix(in srgb, #d9384d 40%, ${rule});background:color-mix(in srgb, #d9384d 9%, ${bg})}
.aether-adaptive :where(.alert-major){display:block;margin:1em 0;padding:12px 16px;border-inline-start:5px solid #d9384d;border-radius:8px;font-weight:800}
.aether-adaptive :where(.completed){border-inline-start-color:#269d63}
.aether-adaptive :where(.active){border-inline-start-color:${link}}
.aether-adaptive :where(.directory){padding-top:28px}
.aether-adaptive :where(.directory ul){margin:.6em 0;padding-left:1.3em;border-left:1px solid ${rule}}
.aether-adaptive :where(.directory li){margin:.65em 0}
.aether-adaptive :where(.directory li)::marker{color:${link}}
.aether-adaptive :where(.navbar){justify-content:flex-start;margin:1em 0;padding:12px;border:1px solid ${rule};border-radius:12px;background:${softerSurface}}
.aether-adaptive :where(.searchbar){color:${link}}
.aether-adaptive :where(.repository-card a,.directory a){display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:100%;margin:.55em 0;padding:.72em .9em;border:1px solid ${rule};border-inline-start:3px solid ${link};border-radius:9px;background:${codeBg};color:${link};text-decoration:none;line-height:1.5;transition:transform .18s ease,border-color .18s ease,background .18s ease}
.aether-adaptive :where(.repository-card a,.directory a):hover{transform:translateY(-1px);border-color:${link};background:${surface}}
.aether-adaptive :where(a.aether-empty-link){display:inline-flex;align-items:center;justify-content:space-between;gap:20px;min-width:min(220px,100%);min-height:48px;margin:.25em 0;padding:8px 14px;border:1px solid ${rule};border-inline-start:3px solid ${link};border-radius:12px;background:${codeBg};color:${link};text-decoration:none;vertical-align:middle}
.aether-adaptive :where(a.aether-empty-link)::before{content:"LINK";display:inline-block;padding:4px 11px;border:1px solid ${link};border-radius:999px;background:${surface};color:${link};font:750 11px/1.5 ${appFont};letter-spacing:.08em}
.aether-adaptive :where(a.aether-empty-link .quality){background:${surface};color:${link};border-color:${rule}}
.aether-adaptive :where(.repository-card hr,.directory hr){margin:1.5em 0;background:${rule}}
.aether-adaptive :where(.repository-footer){margin-top:1.5em;padding-top:1em;border-top:1px solid ${rule}}
.aether-adaptive :where(.status-card){padding:clamp(16px,3vw,24px)}
.aether-adaptive :where(.count){font-size:clamp(2rem,6vw,4rem);font-weight:800;color:${link}}
.aether-adaptive :where(.femdom){display:inline-block;padding:.3em .7em;border-radius:8px;background:${surface};color:${heading}}
.aether-adaptive a:focus-visible,.aether-adaptive button:focus-visible{outline:3px solid ${link};outline-offset:3px}
`;

  if (themeID === 'classic-writer') {
    css += `.aether-adaptive :where(.card,.repository-card,.directory,.status-card){border-radius:12px;box-shadow:none}\n`;
  } else if (themeID === 'typewriter-focus') {
    css += `.aether-adaptive{max-width:760px;font-family:${theme.font || 'Georgia, serif'}}.aether-adaptive h1,.aether-adaptive h2{letter-spacing:-.025em}.aether-adaptive h2{padding-bottom:.35em;border-bottom:1px solid ${rule}}.aether-adaptive :where(.card,.repository-card,.directory){border-radius:4px;box-shadow:none}\n`;
  } else if (themeID === 'terminal-hacker') {
    css += `.aether-adaptive{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.aether-adaptive h1::before{content:"> ";color:${link}}.aether-adaptive h2::before{content:"./ ";color:${link}}.aether-adaptive :where(.card,.repository-card,.directory,.status-card){border-style:dashed;border-radius:3px;box-shadow:${dark ? `0 0 18px color-mix(in srgb, ${link} 9%, transparent)` : 'none'}}.aether-adaptive a{text-decoration:none;border-bottom:1px dashed ${link}}\n`;
  } else if (themeID === 'academic-paper') {
    css += `.aether-adaptive{max-width:720px;min-height:100%;font-size:15px;line-height:1.9}.aether-adaptive h1{text-align:center}.aether-adaptive h2,.aether-adaptive h3{font-family:${font};font-variant:small-caps;letter-spacing:.04em}.aether-adaptive :where(.card,.repository-card,.directory,.status-card){border-radius:2px;box-shadow:none}\n`;
  } else if (themeID === 'zen-distraction-free') {
    css += `.aether-adaptive{max-width:720px;font-size:17px;line-height:1.95}.aether-adaptive :where(.card,.repository-card,.directory,.status-card,.stats-card){padding:1em 0;border:0;border-top:1px solid ${rule};border-radius:0;background:transparent;box-shadow:none}.aether-adaptive :where(.repository-info,.stats){gap:8px}\n`;
  } else if (themeID === 'magazine-layout') {
    css += `.aether-adaptive{max-width:960px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 30px;align-content:start;font-size:14px;line-height:1.8}.aether-adaptive>:where(h1,h2,h3,h4,h5,h6,blockquote,pre,table,hr,.card,.repository-card,.directory,.status-card,.stats-card,.navbar,.repository-info,.stats,.layout){grid-column:1/-1}.aether-adaptive h1{padding-bottom:16px;border-bottom:4px solid ${heading};font-size:clamp(32px,4vw,48px)}.aether-adaptive h2{text-transform:uppercase;letter-spacing:-.02em}.aether-adaptive blockquote{padding:18px 24px;border:0;background:${surface};color:${link};font-size:1.4em;font-weight:750;text-align:center}.aether-adaptive :where(.card,.repository-card,.directory,.status-card){border-radius:2px;box-shadow:none}\n`;
  } else if (themeID === 'dashboard-notion') {
    css += `.aether-adaptive :where(.card,.repository-card,.directory,.status-card,.stats-card){border-radius:12px;box-shadow:none;border-color:${rule};background:${softerSurface}}.aether-adaptive :where(.repository-item,.stats>div){border-radius:8px;background:${bg}}.aether-adaptive :where(h1,h2,h3){letter-spacing:-.035em}\n`;
  } else if (themeID === 'cyberpunk-neon') {
    css += `.aether-adaptive h1,.aether-adaptive h2{text-transform:uppercase;letter-spacing:.045em}.aether-adaptive :where(.card,.repository-card,.directory,.status-card,.stats-card){border-radius:3px;border-color:${link};box-shadow:0 0 18px color-mix(in srgb, ${link} ${dark ? '18%' : '10%'}, transparent)}.aether-adaptive a{text-decoration:none;border-bottom:1px solid ${link}}${dark ? `.aether-adaptive h1,.aether-adaptive h2{text-shadow:0 0 18px color-mix(in srgb, ${link} 28%, transparent)}` : ''}\n`;
  } else if (themeID === 'parchment-warm') {
    css += `.aether-adaptive{font-family:${font};line-height:1.95}.aether-adaptive h1,.aether-adaptive h2{font-family:${font};letter-spacing:-.025em}.aether-adaptive :where(.card,.repository-card,.directory,.status-card){border-radius:3px;box-shadow:none;border-style:solid}.aether-adaptive :where(.repository-item,.stats>div){border-radius:2px}\n`;
  } else if (themeID === 'high-contrast') {
    css += `.aether-adaptive{font-size:19px;line-height:1.9}.aether-adaptive :where(.card,.repository-card,.directory,.status-card,.stats-card,.repository-item,.stats>div){border:2px solid ${ink};border-inline-start-width:6px;border-radius:0;box-shadow:none;background:${bg}}.aether-adaptive a{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}.aether-adaptive :where(.quality,.meta,.alert,.tag,.repository-badge){border:2px solid currentColor;border-radius:2px}\n`;
  }

  css += `@media(max-width:680px){body{padding:18px}.aether-adaptive{display:block}.aether-adaptive :where(.repository-card,.directory,.card,.status-card){padding:16px}.aether-adaptive :where(.repository-info,.stats,.layout){grid-template-columns:minmax(0,1fr)}.aether-adaptive :where(.repository-card a,.directory a){align-items:flex-start;flex-wrap:wrap}.aether-adaptive :where(.repository-title){font-size:1.6rem}}\n`;
  return css;
}

export function createFallbackPreviewCSS(theme = {}) {
  const bg = theme.background || '#fffefa';
  const ink = theme.ink || '#363732';
  const heading = theme.heading || theme.ink || '#292a28';
  const link = theme.link || '#55745d';
  const codeBg = theme.codeBackground || '#f0f0e9';
  const codeInk = theme.codeInk || '#3c483d';
  const rule = theme.rule || '#deddd4';
  const quote = theme.quote || '#a5b5a4';
  const font = theme.font || 'Georgia, "Times New Roman", serif';
  const appFont = theme.appFont || 'system-ui, sans-serif';
  const focus = theme.focus || link;
  const appearance = theme.appearance === 'dark' ? 'dark' : 'light';
  const themeID = theme.id || 'classic-writer';
  const adaptive = Boolean(theme.adaptive);

  return `
:root{color-scheme:${appearance};font-synthesis:none;text-rendering:optimizeLegibility}
*{box-sizing:border-box}
html{min-height:100%;background:${bg}}
body{min-height:100%;margin:0;padding:clamp(24px,4vw,52px);background:${bg};color:${ink};font:16px/1.8 ${font};overflow-wrap:anywhere}
.markdown-body{max-width:770px;margin:0 auto}
.markdown-body>:first-child{margin-top:0}
h1,h2,h3,h4,h5,h6{color:${heading};font-family:${appFont};font-weight:650;line-height:1.25;margin:1.7em 0 .55em}
h1{font-size:clamp(28px,3.5vw,42px);letter-spacing:-.045em;line-height:1.12;margin-top:.2em}
h2{font-size:1.55em}h3{font-size:1.22em}p{margin:0 0 1.1em}
a{color:${link};text-underline-offset:3px}strong{font-weight:750;color:${heading}}
ul,ol{margin:.35em 0 1.25em;padding-left:1.5em}li{margin:.3em 0;padding-left:.12em}li::marker{color:${link}}
hr{height:1px;border:0;background:${rule};margin:2em 0}
blockquote{margin:1.45em 0;padding:.2em 0 .2em 1.2em;border-left:3px solid ${quote};font-style:italic}
code{padding:.13em .35em;border:1px solid ${rule};border-radius:4px;background:${codeBg};color:${codeInk};font-family:ui-monospace,Consolas,monospace;font-size:.84em}
pre{overflow:auto;padding:16px 18px;border:1px solid ${rule};border-radius:8px;background:${codeBg};color:${codeInk};font-size:13px;line-height:1.7;tab-size:2}pre code{padding:0;border:0;background:transparent;font-size:inherit}
table{width:100%;border-collapse:collapse;margin:1.4em 0 1.6em;font-family:${appFont};font-size:.9em}th,td{padding:9px 11px;border:1px solid ${rule};text-align:left}th{background:${codeBg};color:${heading}}
img{max-width:100%;height:auto;border-radius:7px}input[type=checkbox]{accent-color:${link};vertical-align:-.1em;margin-right:.4em}
${themeID === 'academic-paper' ? '.markdown-body{max-width:720px;min-height:100%;font-size:15px;line-height:1.9}.markdown-body p:first-of-type::first-letter{float:left;padding-right:.08em;font-size:3.1em;font-weight:700;line-height:.83}' : ''}
${themeID === 'magazine-layout' ? '.markdown-body{max-width:960px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 32px;font-size:14px}.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body blockquote,.markdown-body pre,.markdown-body table,.markdown-body hr{grid-column:1/-1}' : ''}
${themeID === 'terminal-hacker' ? `body{font-family:ui-monospace,Consolas,monospace}${appearance === 'dark' ? 'h1,h2,h3{text-shadow:0 0 10px currentColor}' : ''}` : ''}
${themeID === 'high-contrast' ? `body{font-size:19px;line-height:1.9}h1,h2,h3,h4,h5,h6,strong{color:${heading}}a{color:${link};text-decoration-thickness:3px}button:focus-visible,a:focus-visible{outline:4px solid ${focus};outline-offset:4px}` : ''}
${adaptive ? createAdaptiveContentStyles({ ...theme, id: themeID, appearance, background: bg, ink, heading, link, codeBackground: codeBg, rule, quote, appFont, font }) : ''}
`;
}
