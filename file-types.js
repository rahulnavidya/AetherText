/** Supported text-based file modes. Unknown extensions safely use plain-text preview. */
const DEFINITIONS = [
  { id: 'markdown', label: 'Markdown', short: 'MD', kind: 'markdown', mime: 'text/markdown; charset=utf-8', extensions: ['.md', '.markdown', '.mdown', '.mkd', '.mdx'] },
  { id: 'html', label: 'HTML', short: 'HTML', kind: 'html', mime: 'text/html; charset=utf-8', extensions: ['.html', '.htm', '.xhtml'] },
  { id: 'text', label: 'Plain text', short: 'TXT', kind: 'plain', mime: 'text/plain; charset=utf-8', extensions: ['.txt', '.text'] },
  { id: 'css', label: 'CSS', short: 'CSS', kind: 'code', mime: 'text/css; charset=utf-8', extensions: ['.css', '.scss', '.sass', '.less'] },
  { id: 'javascript', label: 'JavaScript source', short: 'JS', kind: 'code', mime: 'text/javascript; charset=utf-8', extensions: ['.js', '.mjs', '.cjs'] },
  { id: 'typescript', label: 'TypeScript source', short: 'TS', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.ts', '.tsx'] },
  { id: 'jsx', label: 'JSX source', short: 'JSX', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.jsx'] },
  { id: 'json', label: 'JSON', short: 'JSON', kind: 'code', mime: 'application/json; charset=utf-8', extensions: ['.json', '.jsonc', '.ipynb'] },
  { id: 'xml', label: 'XML', short: 'XML', kind: 'code', mime: 'application/xml; charset=utf-8', extensions: ['.xml', '.xsl', '.xslt', '.rss', '.atom'] },
  { id: 'yaml', label: 'YAML', short: 'YAML', kind: 'code', mime: 'text/yaml; charset=utf-8', extensions: ['.yaml', '.yml'] },
  { id: 'toml', label: 'TOML', short: 'TOML', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.toml'] },
  { id: 'csv', label: 'CSV / TSV', short: 'CSV', kind: 'code', mime: 'text/csv; charset=utf-8', extensions: ['.csv', '.tsv'] },
  { id: 'svg', label: 'SVG source', short: 'SVG', kind: 'svg', mime: 'image/svg+xml; charset=utf-8', extensions: ['.svg'] },
  { id: 'image', label: 'Image asset', short: 'IMG', kind: 'asset-image', mime: 'application/octet-stream', extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.tif', '.tiff'] },
  { id: 'pdf', label: 'PDF document', short: 'PDF', kind: 'asset-pdf', mime: 'application/pdf', extensions: ['.pdf'] },
  { id: 'audio', label: 'Audio asset', short: 'AUD', kind: 'asset-audio', mime: 'application/octet-stream', extensions: ['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus'] },
  { id: 'video', label: 'Video asset', short: 'VID', kind: 'asset-video', mime: 'application/octet-stream', extensions: ['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi'] },
  { id: 'python', label: 'Python source', short: 'PY', kind: 'code', mime: 'text/x-python; charset=utf-8', extensions: ['.py', '.pyw'] },
  { id: 'shell', label: 'Shell / script source', short: 'SH', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd'] },
  { id: 'sql', label: 'SQL source', short: 'SQL', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.sql'] },
  { id: 'ini', label: 'INI / configuration', short: 'INI', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.ini', '.cfg', '.conf', '.properties', '.env.example'] },
  { id: 'log', label: 'Log file', short: 'LOG', kind: 'plain', mime: 'text/plain; charset=utf-8', extensions: ['.log'] },
  { id: 'java', label: 'Java source', short: 'JAVA', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.java'] },
  { id: 'c-family', label: 'C / C++ source', short: 'C++', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'] },
  { id: 'systems', label: 'Go / Rust / Kotlin / Swift source', short: 'CODE', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.go', '.rs', '.swift', '.kt', '.kts', '.rb', '.lua', '.pl', '.pm', '.r'] },
  { id: 'php', label: 'PHP source', short: 'PHP', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.php', '.phtml'] },
  { id: 'web-component', label: 'Component source', short: 'COMP', kind: 'code', mime: 'text/plain; charset=utf-8', extensions: ['.vue', '.svelte', '.astro'] },
  { id: 'other', label: 'Other text file', short: 'TXT', kind: 'plain', mime: 'text/plain; charset=utf-8', extensions: [] },
];

const BY_EXTENSION = new Map(DEFINITIONS.flatMap((item) => item.extensions.map((extension) => [extension, item])));
const EXTENSIONLESS_TEXT_FILENAMES = new Set(['makefile', 'dockerfile', 'justfile', '.gitignore', '.gitattributes', '.editorconfig', '.dockerignore', '.npmrc', '.prettierrc']);
const NEW_FILE_TYPES = [
  { id: 'markdown', label: 'Markdown (.md)', extension: '.md' },
  { id: 'text', label: 'Plain text (.txt)', extension: '.txt' },
  { id: 'html', label: 'HTML document (.html)', extension: '.html' },
  { id: 'css', label: 'CSS stylesheet (.css)', extension: '.css' },
  { id: 'javascript', label: 'JavaScript source (.js)', extension: '.js' },
  { id: 'json', label: 'JSON (.json)', extension: '.json' },
  { id: 'xml', label: 'XML (.xml)', extension: '.xml' },
  { id: 'yaml', label: 'YAML (.yaml)', extension: '.yaml' },
  { id: 'csv', label: 'CSV data (.csv)', extension: '.csv' },
  { id: 'svg', label: 'SVG source (.svg)', extension: '.svg' },
  { id: 'python', label: 'Python source (.py)', extension: '.py' },
  { id: 'sql', label: 'SQL source (.sql)', extension: '.sql' },
  { id: 'log', label: 'Log file (.log)', extension: '.log' },
  { id: 'other', label: 'Other text file (choose extension)', extension: '' },
];

export function fileExtension(filename = '') {
  const base = String(filename).split(/[\\/]/).pop().trim();
  if (!base) return '';
  if (/^\.[^.]+$/.test(base)) return base.toLowerCase();
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(index).toLowerCase() : '';
}

export function getFileType(filename = 'Untitled.md') {
  const base = String(filename).split(/[\\/]/).pop().toLowerCase();
  if (EXTENSIONLESS_TEXT_FILENAMES.has(base) || base === '.env.example') {
    return { id: 'ini', label: 'Text / configuration', short: 'CONF', kind: 'code', mime: 'text/plain; charset=utf-8', extension: fileExtension(base) };
  }
  if (base === '.env') return { ...BY_EXTENSION.get('.ini'), extension: '.env' };
  const extension = fileExtension(base);
  const found = BY_EXTENSION.get(extension);
  if (found) return { ...found, extension };
  return { id: 'other', label: extension ? `${extension.slice(1).toUpperCase()} text` : 'Plain text', short: (extension ? extension.slice(1) : 'TXT').slice(0, 5).toUpperCase(), kind: 'plain', mime: 'text/plain; charset=utf-8', extensions: [], extension };
}

export function isMarkdownFile(filename) { return getFileType(filename).kind === 'markdown'; }
export function isHTMLFile(filename) { return getFileType(filename).kind === 'html'; }
export function supportsMarkupPreview(filename) {
  const kind = getFileType(filename).kind;
  return kind === 'markdown' || kind === 'html';
}

/** Choose a purpose-built preview; ordinary source files stay in editor-only mode. */
export function getPreviewMode(filename, options = {}) {
  const type = getFileType(filename);
  // Classify known binary extensions even before a Blob is attached; the UI
  // keeps an empty newly-created asset-named tab editor-only until import.
  if (type.kind.startsWith('asset-')) return type.kind;
  if (options.hasAsset) {
    if (type.kind.startsWith('asset-')) return type.kind;
    const mime = String(options.assetMime || '').toLowerCase();
    if (mime.startsWith('image/')) return 'asset-image';
    if (mime.startsWith('audio/')) return 'asset-audio';
    if (mime.startsWith('video/')) return 'asset-video';
    if (mime === 'application/pdf') return 'asset-pdf';
  }
  if (type.kind === 'markdown' || type.kind === 'html') return 'browser';
  if (type.id === 'css' && type.extension === '.css') return 'css-demo';
  if (type.id === 'json' && ['.json', '.jsonc', '.ipynb'].includes(type.extension)) return 'json-data';
  if (type.id === 'csv' && ['.csv', '.tsv'].includes(type.extension)) return 'tabular-data';
  if (type.id === 'svg') return 'svg-image';
  return 'source-only';
}

export function isAssetFile(filename) { return getFileType(filename).kind.startsWith('asset-'); }
export function mimeTypeForFilename(filename) { return getFileType(filename).mime || 'text/plain; charset=utf-8'; }
export function getNewFileTypes() { return NEW_FILE_TYPES.map((item) => ({ ...item })); }

export function cleanFilename(name, fallbackExtension = '.md') {
  let cleaned = String(name ?? '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.+$/, '').slice(0, 120);
  if (!cleaned) cleaned = 'Untitled';
  if (!fileExtension(cleaned) && !EXTENSIONLESS_TEXT_FILENAMES.has(cleaned.toLowerCase())) cleaned += fallbackExtension || '.txt';
  return cleaned;
}

export function filenameForType(name, typeId = 'markdown') {
  const type = NEW_FILE_TYPES.find((item) => item.id === typeId) || NEW_FILE_TYPES[0];
  let base = String(name || 'Untitled.md').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 120) || 'Untitled.md';
  if (type.id === 'other') return base;
  if (fileExtension(base)) base = base.slice(0, -fileExtension(base).length) || 'Untitled';
  return `${base.replace(/\.+$/, '') || 'Untitled'}${type.extension}`;
}

export function looksLikeBinaryText(text) {
  const value = String(text);
  if (value.includes('\u0000')) return true;
  const sample = value.slice(0, 8192);
  if (!sample.length) return false;
  const controlCount = (sample.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g) || []).length;
  return controlCount / sample.length > 0.015;
}

export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const IMPORT_ACCEPT = [
  '.md', '.markdown', '.mdown', '.mkd', '.mdx', '.txt', '.text', '.html', '.htm', '.xhtml',
  '.css', '.scss', '.sass', '.less', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.jsonc', '.ipynb',
  '.xml', '.xsl', '.xslt', '.rss', '.atom', '.yaml', '.yml', '.toml', '.csv', '.tsv', '.svg', '.py', '.pyw',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.sql', '.ini', '.cfg', '.conf', '.env', '.log', '.properties',
  '.java', '.kt', '.kts', '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx', '.go', '.rs', '.swift', '.rb',
  '.lua', '.pl', '.pm', '.r', '.php', '.phtml', '.vue', '.svelte', '.astro', '.makefile', '.dockerfile',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.tif', '.tiff', '.pdf',
  '.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus', '.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi',
].join(',');
