
/** Parse delimited text with basic RFC 4180 quote handling and predictable rendering limits. */
export function parseDelimitedText(source, delimiter = ',', options = {}) {
  const rowLimit = clampInteger(options.rowLimit, 100, 1, 1000);
  const columnLimit = clampInteger(options.columnLimit, 20, 1, 100);
  const cellLimit = rowLimit * columnLimit;
  const text = String(source ?? '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let truncated = false;
  let columnsTruncated = false;
  let cellsSeen = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') inQuotes = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) { inQuotes = true; continue; }
    if (char === delimiter) {
      row.push(field); field = ''; cellsSeen++;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; cellsSeen++;
      if (row.length > columnLimit) columnsTruncated = true;
      if (row.some((cell) => cell.length) || rows.length) rows.push(row.slice(0, columnLimit));
      row = [];
      if (rows.length >= rowLimit || cellsSeen >= cellLimit) { truncated = i < text.length - 1; break; }
    } else field += char;
    if (cellsSeen >= cellLimit) { truncated = i < text.length - 1; break; }
  }
  if ((!truncated || field.length || row.length) && !(row.length === 0 && field.length === 0 && /[\r\n]$/.test(text))) {
    row.push(field);
    if (row.length > columnLimit) columnsTruncated = true;
    if (row.some((cell) => cell.length) || rows.length) rows.push(row.slice(0, columnLimit));
  }
  const trimmedRows = rows.slice(0, rowLimit);
  return {
    rows: trimmedRows,
    truncated: truncated || rows.length > rowLimit,
    columnsTruncated,
  };
}

export function parseJSONPreview(source) {
  try {
    const value = JSON.parse(String(source ?? ''));
    return { valid: true, formatted: JSON.stringify(value, null, 2), value };
  } catch (error) {
    return { valid: false, formatted: String(source ?? ''), error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

/** A script-free, CSP-restricted CSS playground; author CSS is the only user-controlled content. */
export function buildCSSPlayground(cssSource = '') {
  const css = String(cssSource).replace(/<\/style/gi, '<\\/style');
  const sample = `
    <main class="css-demo">
      <header class="demo-header"><span class="demo-kicker">AETHERTEXT · CSS PREVIEW</span><h1>Your stylesheet, in action</h1><p>Rules from the CSS file are applied to these sample elements.</p></header>
      <section class="card"><span class="badge">PREVIEW</span><h2>Sample card</h2><p>Typography, spacing, color, borders and shadows are previewed here.</p><a href="#sample-link">A sample link</a><button type="button">Sample button</button></section>
      <section class="card"><h2>Lists &amp; code</h2><ul><li>First list item</li><li>Second list item</li><li>Third list item</li></ul><pre><code>.card { padding: 1rem; }</code></pre></section>
      <section class="card"><h2>Form controls</h2><label>Example input <input value="Editable-looking sample" readonly></label></section>
    </main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:;"><style>
    :root{color-scheme:light dark;font:16px/1.6 system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;padding:clamp(16px,4vw,38px);background:#f5f6f8;color:#252936;min-height:100vh} .css-demo{max-width:850px;margin:0 auto}.demo-header{margin-bottom:25px}.demo-kicker{font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.13em;color:#65708b}.card{padding:22px;margin:0 0 18px;border:1px solid #dfe3eb;border-radius:14px;background:#fff;box-shadow:0 5px 20px #1d274012}.badge{display:inline-block;padding:3px 8px;border-radius:99px;background:#e8ecff;color:#3348a0;font-size:11px;font-weight:800}h1{font-size:clamp(28px,5vw,42px);line-height:1.12}h2{margin-top:0}a{color:#365bd6}button,input{font:inherit;padding:8px 11px;border:1px solid #cbd2df;border-radius:7px;background:#fff;color:inherit}button{margin-left:8px}pre{overflow:auto;padding:12px;border-radius:8px;background:#f0f1f4}label{display:grid;gap:8px;max-width:420px}
    </style>${css ? `<style>${css}</style>` : ''}</head><body>${sample}</body></html>`;
}

/** Remove active SVG elements and event attributes before displaying SVG in an <img>. */
export function sanitizeSVGForImage(source) {
  return String(source ?? '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])(?!data:image\/(?:png|jpeg|gif|webp);base64,|#)[\s\S]*?\1/gi, '')
    .replace(/url\(\s*(['"]?)(?:https?:|\/\/|javascript:)[^)]*\)/gi, 'none');
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
}
