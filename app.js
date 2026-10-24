import { readWorkspace, writeWorkspace, clearWorkspace, listHistory, writeHistoryVersion } from './db.js';
import { buildBrowserDocument, createFallbackPreviewCSS, hasDocumentJavaScript } from './browser-preview.js';
import { buildStandaloneHTML } from './html-export.js';
import { findOccurrences, replaceOccurrences, replaceOccurrenceAt, SNIPPETS, VIEWPORTS, safeHTMLFilename } from './editor-tools.js';
import { getTagCompletionContext, suggestHTMLTags, completeTagToken, getTagAutoCloseEdit, getPairedDelimiterEdit } from './editor-autocomplete.js';
import { getFileType, isMarkdownFile, supportsMarkupPreview, getPreviewMode, isAssetFile, mimeTypeForFilename, getNewFileTypes, filenameForType, cleanFilename, looksLikeBinaryText, IMPORT_MAX_BYTES, IMPORT_ACCEPT } from './file-types.js';
import { parseDelimitedText, parseJSONPreview, buildCSSPlayground, sanitizeSVGForImage } from './file-preview.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const body = document.body;
const editor = $('#editor');
const mirror = $('#editor-mirror');
const browserPreviewFrame = $('#browser-preview-frame');
const nonbrowserPreviewSurface = $('#nonbrowser-preview-surface');
const previewAddress = $('#preview-address');
const tabsList = $('#tabs-list');
const saveState = $('#save-state');
const saveLabel = $('#save-label');
const paletteBackdrop = $('#palette-backdrop');
const paletteSearch = $('#palette-search');
const paletteResults = $('#palette-results');
const settingsBackdrop = $('#settings-backdrop');
const themeSelect = $('#theme-select');
const appearanceSelect = $('#appearance-select');
const previewStyleSelect = $('#preview-style-select');
const fontSelect = $('#font-select');
const referencePanel = $('#reference-panel');
const referenceUrl = $('#reference-url');
const referenceFrame = $('#reference-frame');
const referenceEmpty = $('#reference-empty');
const toastRegion = $('#toast-region');
const findBackdrop = $('#find-backdrop');
const snippetsBackdrop = $('#snippets-backdrop');
const historyBackdrop = $('#history-backdrop');
const viewportSelect = $('#viewport-select');
const historyList = $('#history-list');
const autocompletePopup = $('#autocomplete-popup');
const editorWrap = $('#editor-wrap');
const newFileBackdrop = $('#new-file-backdrop');
const newFileName = $('#new-file-name');
const newFileType = $('#new-file-type');
const importFilesInput = $('#import-files');

const THEMES = [
  { id: 'classic-writer', label: 'Classic Writer', description: 'Quiet, balanced, and familiar.', icon: '◷' },
  { id: 'typewriter-focus', label: 'Typewriter Focus', description: 'Warm paper, centered cursor, dimmed lines.', icon: '⌁' },
  { id: 'terminal-hacker', label: 'Terminal / Hacker', description: 'Phosphor green in dark or light terminal mode.', icon: '>_' },
  { id: 'academic-paper', label: 'Academic Paper', description: 'Scholarly typography and paper margins.', icon: '¶' },
  { id: 'zen-distraction-free', label: 'Zen / Distraction-free', description: 'Hide the chrome; give the words room.', icon: '◌' },
  { id: 'magazine-layout', label: 'Magazine Layout', description: 'Editorial columns, bold headlines, pull quotes.', icon: '▤' },
  { id: 'dashboard-notion', label: 'Dashboard / Notion-style', description: 'Soft surfaces and clear document blocks.', icon: '▦' },
  { id: 'cyberpunk-neon', label: 'Cyberpunk / Neon', description: 'Magenta-cyan neon on dark or light surfaces.', icon: '✳' },
  { id: 'parchment-warm', label: 'Parchment / Warm', description: 'Bookish serif warmth and sepia tones.', icon: '❧' },
  { id: 'high-contrast', label: 'High-contrast accessibility', description: 'Black and white, larger type, stronger focus.', icon: '◐' },
];

const CURATED_FONTS = [
  // Curated from the supplied font inventory. These are CSS family names, not bundled files;
  // browsers use the installed family when available and the fallback otherwise.
  { id: 'system', label: 'System UI', family: 'system-ui', fallback: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', group: 'Everyday & UI' },
  { id: 'segoe-ui', label: 'Segoe UI', family: 'Segoe UI', fallback: 'system-ui, sans-serif', group: 'Everyday & UI' },
  { id: 'arial', label: 'Arial', family: 'Arial', fallback: 'Helvetica, sans-serif', group: 'Everyday & UI' },
  { id: 'helvetica-now-display', label: 'Helvetica Now Display', family: 'Helvetica Now Display', fallback: 'Segoe UI, Arial, sans-serif', group: 'Everyday & UI' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope', fallback: 'Segoe UI, sans-serif', group: 'Everyday & UI' },
  { id: 'poppins', label: 'Poppins', family: 'Poppins', fallback: 'system-ui, sans-serif', group: 'Display & geometric' },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat', fallback: 'Arial, sans-serif', group: 'Display & geometric' },
  { id: 'outfit', label: 'Outfit', family: 'Outfit', fallback: 'system-ui, sans-serif', group: 'Display & geometric' },
  { id: 'futura', label: 'Futura', family: 'Futura Md BT', fallback: 'Century Gothic, sans-serif', group: 'Display & geometric' },
  { id: 'century-gothic', label: 'Century Gothic', family: 'Century Gothic', fallback: 'Arial, sans-serif', group: 'Display & geometric' },
  { id: 'bebas-neue', label: 'Bebas Neue', family: 'Bebas Neue', fallback: 'Impact, sans-serif', group: 'Display & geometric' },
  // Serif choices confirmed in the provided inventory.
  { id: 'georgia', label: 'Georgia', family: 'Georgia', fallback: 'serif', group: 'Serif' },
  { id: 'garamond', label: 'Garamond', family: 'Garamond', fallback: 'Georgia, serif', group: 'Serif' },
  { id: 'bodoni-mt', label: 'Bodoni MT', family: 'Bodoni MT', fallback: 'Georgia, serif', group: 'Serif' },
  // Monospaced options: practical, coding-oriented, and with a generic fallback.
  { id: 'monospace', label: 'Monospace (system)', family: 'ui-monospace', fallback: 'SFMono-Regular, Consolas, "Liberation Mono", monospace', group: 'Monospace' },
  { id: 'consolas', label: 'Consolas', family: 'Consolas', fallback: 'Cascadia Mono, "Courier New", monospace', group: 'Monospace' },
  { id: 'cascadia-code', label: 'Cascadia Code', family: 'Cascadia Code', fallback: 'Consolas, monospace', group: 'Monospace' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', family: 'IBM Plex Mono', fallback: 'Cascadia Code, Consolas, monospace', group: 'Monospace' },
  { id: 'fira-code', label: 'Fira Code', family: 'Fira Code', fallback: 'Cascadia Code, Consolas, monospace', group: 'Monospace' },
  { id: 'bitstream-vera-sans-mono', label: 'Bitstream Vera Sans Mono', family: 'Bitstream Vera Sans Mono', fallback: 'Consolas, monospace', group: 'Monospace' },
];

const LEGACY_FONT_MIGRATIONS = {
  aptos: 'segoe-ui',
  inter: 'manrope',
  roboto: 'segoe-ui',
  verdana: 'arial',
  tahoma: 'segoe-ui',
  trebuchet: 'century-gothic',
  times: 'garamond',
  'jetbrains-mono': 'cascadia-code',
  'courier-new': 'consolas',
};

const WELCOME_TEXT = `# A quieter place to think

AetherText is a small, local-first space for writing in **Markdown**. No account, no cloud, no parade of buttons. Just you and the words.

## Make yourself at home

- Write on the left; your formatted document appears on the right.
- Your open tabs, drafts, cursor positions, and scroll positions are saved on this device.
- Press **Ctrl K** to open the command palette.
- Explore ten themes with System, Light, and Dark appearance modes. Terminal and Cyberpunk each have dedicated light and dark palettes.

> Good writing often begins as a mess. The trick is to give the mess somewhere safe to live.

## A few Markdown basics

| Style | Syntax | Result |
| --- | --- | --- |
| Bold | \`**word**\` | **word** |
| Italic | \`*word*\` | *word* |
| Link | \`[label](https://example.com)\` | [label](https://example.com) |

\`\`\`js
const thought = "worth keeping";
console.log(thought);
\`\`\`

- [x] Start writing
- [ ] Find a good sentence
- [ ] Keep going

---

*Your next thought can start right here.*`;

let workspaceState = null;
let discoveredFonts = [];
let fontRulesElement = null;
let saveTimer = 0;
let saveInFlight = false;
let saveAgain = false;
let stateRevision = 0;
let previewRenderTimer = 0;
let latestPreviewScroll = 0;
let latestPreviewScrollLeft = 0;
let previewRestoreScroll = { x: 0, y: 0 };
let previewMetrics = { height: 0, viewport: 1 };
let suppressPreviewScrollUntil = 0;
let isSyncingScroll = false;
let activeCommandIndex = 0;
let commandCache = [];
let modalFocusReturn = null;
let referenceLoaded = false;
let lastHistorySnapshots = new Map();
let lastHistoryCheck = new Map();
let historyBusy = false;
let activeFindMatchIndex = -1;
let currentFindMatches = [];
let currentSnippetCategory = 'All';
let autocompleteItems = [];
let autocompleteContext = null;
let activeAutocompleteIndex = 0;
let dismissedAutocompleteKey = '';
let previewAssetObjectURL = '';
const ACCENT_PRESETS = ['#657b68', '#4c83e8', '#9b6de3', '#db4f83', '#e08a38', '#159b91', '#d4a017', '#ef5b52'];

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeTab(name = 'Untitled.md', text = '') {
  return {
    id: makeId(), name, text, dirty: Boolean(text), cursorStart: 0, cursorEnd: 0,
    editorScrollTop: 0, editorScrollLeft: 0, previewScrollTop: 0, previewScrollLeft: 0, runJavaScript: false, assetBlob: null, assetMime: '',
  };
}

function defaultWorkspace() {
  return {
    schemaVersion: 2,
    tabs: [{ ...makeTab('Welcome.md', WELCOME_TEXT), dirty: false }],
    activeTabIndex: 0,
    settings: { theme: 'classic-writer', appearance: 'system', previewStyle: 'file', previewViewport: 'responsive', autocomplete: true, autoCloseTags: true, accentColor: '', editorFontSize: 12, editorLineHeight: 'comfortable', editorTabSize: 4, editorWordWrap: true, reduceMotion: false, font: { id: 'system', family: 'system-ui', fallback: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' } },
    referenceUrl: '',
  };
}

function normaliseWorkspace(saved) {
  const fallback = defaultWorkspace();
  if (!saved || !Array.isArray(saved.tabs) || saved.tabs.length === 0) return fallback;
  const tabs = saved.tabs.filter((tab) => tab && typeof tab === 'object').map((tab) => ({
    id: typeof tab.id === 'string' ? tab.id : makeId(),
    name: typeof tab.name === 'string' && tab.name.trim() ? tab.name.slice(0, 120) : 'Untitled.md',
    text: typeof tab.text === 'string' ? tab.text : '',
    dirty: Boolean(tab.dirty),
    cursorStart: Number.isFinite(tab.cursorStart) ? Math.max(0, tab.cursorStart) : 0,
    cursorEnd: Number.isFinite(tab.cursorEnd) ? Math.max(0, tab.cursorEnd) : 0,
    editorScrollTop: Number.isFinite(tab.editorScrollTop) ? Math.max(0, tab.editorScrollTop) : 0,
    editorScrollLeft: Number.isFinite(tab.editorScrollLeft) ? Math.max(0, tab.editorScrollLeft) : 0,
    previewScrollTop: Number.isFinite(tab.previewScrollTop) ? Math.max(0, tab.previewScrollTop) : 0,
    previewScrollLeft: Number.isFinite(tab.previewScrollLeft) ? Math.max(0, tab.previewScrollLeft) : 0,
    runJavaScript: Boolean(tab.runJavaScript),
    assetBlob: typeof Blob !== 'undefined' && tab.assetBlob instanceof Blob ? tab.assetBlob : null,
    assetMime: typeof tab.assetMime === 'string' ? tab.assetMime.slice(0, 120) : '',
  }));
  if (!tabs.length) return fallback;
  const theme = THEMES.some((candidate) => candidate.id === saved.settings?.theme) ? saved.settings.theme : 'classic-writer';
  const appearance = ['system', 'light', 'dark'].includes(saved.settings?.appearance) ? saved.settings.appearance : 'system';
  const previewStyle = ['file', 'aether'].includes(saved.settings?.previewStyle) ? saved.settings.previewStyle : 'file';
  const previewViewport = VIEWPORTS.some((item) => item.id === saved.settings?.previewViewport) ? saved.settings.previewViewport : 'responsive';
  const autocomplete = typeof saved.settings?.autocomplete === 'boolean' ? saved.settings.autocomplete : true;
  const autoCloseTags = typeof saved.settings?.autoCloseTags === 'boolean' ? saved.settings.autoCloseTags : true;
  const accentColor = typeof saved.settings?.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(saved.settings.accentColor) ? saved.settings.accentColor.toLowerCase() : '';
  const editorFontSize = Number.isFinite(saved.settings?.editorFontSize) ? Math.max(10, Math.min(20, Math.round(saved.settings.editorFontSize))) : 12;
  const editorLineHeight = ['compact', 'comfortable', 'spacious'].includes(saved.settings?.editorLineHeight) ? saved.settings.editorLineHeight : 'comfortable';
  const editorTabSize = [2, 4, 8].includes(Number(saved.settings?.editorTabSize)) ? Number(saved.settings.editorTabSize) : 4;
  const editorWordWrap = typeof saved.settings?.editorWordWrap === 'boolean' ? saved.settings.editorWordWrap : true;
  const reduceMotion = typeof saved.settings?.reduceMotion === 'boolean' ? saved.settings.reduceMotion : false;
  const savedFont = saved.settings?.font && typeof saved.settings.font === 'object' ? saved.settings.font : {};
  const savedFontId = typeof savedFont.id === 'string' ? savedFont.id : 'restored-font';
  const migratedFont = CURATED_FONTS.find((candidate) => candidate.id === LEGACY_FONT_MIGRATIONS[savedFontId]);
  const font = migratedFont
    ? { id: migratedFont.id, family: migratedFont.family, fallback: migratedFont.fallback }
    : typeof savedFont.family === 'string' && savedFont.family.trim()
      ? {
          id: savedFontId,
          family: savedFontId === 'futura' && savedFont.family === 'Futura' ? 'Futura Md BT' : savedFont.family.slice(0, 150),
          fallback: typeof savedFont.fallback === 'string' ? savedFont.fallback.slice(0, 200) : 'sans-serif',
        }
      : fallback.settings.font;
  return {
    schemaVersion: 2,
    tabs,
    activeTabIndex: Math.max(0, Math.min(tabs.length - 1, Number.isInteger(saved.activeTabIndex) ? saved.activeTabIndex : 0)),
    settings: { theme, appearance, previewStyle, previewViewport, autocomplete, autoCloseTags, accentColor, editorFontSize, editorLineHeight, editorTabSize, editorWordWrap, reduceMotion, font },
    referenceUrl: typeof saved.referenceUrl === 'string' ? saved.referenceUrl : '',
  };
}

function currentTab() {
  return workspaceState.tabs[workspaceState.activeTabIndex];
}

function notifyChange() {
  stateRevision++;
  scheduleSave();
}

function snapshotWorkspace() {
  captureActiveView();
  return {
    schemaVersion: 2,
    tabs: workspaceState.tabs.map((tab) => ({ ...tab })),
    activeTabIndex: workspaceState.activeTabIndex,
    settings: {
      theme: workspaceState.settings.theme,
      appearance: workspaceState.settings.appearance || 'system',
      previewStyle: workspaceState.settings.previewStyle || 'file',
      previewViewport: workspaceState.settings.previewViewport || 'responsive',
      autocomplete: workspaceState.settings.autocomplete !== false,
      autoCloseTags: workspaceState.settings.autoCloseTags !== false,
      accentColor: workspaceState.settings.accentColor || '',
      editorFontSize: workspaceState.settings.editorFontSize || 12,
      editorLineHeight: workspaceState.settings.editorLineHeight || 'comfortable',
      editorTabSize: workspaceState.settings.editorTabSize || 4,
      editorWordWrap: workspaceState.settings.editorWordWrap !== false,
      reduceMotion: workspaceState.settings.reduceMotion === true,
      font: { ...workspaceState.settings.font },
    },
    referenceUrl: workspaceState.referenceUrl,
    updatedAt: Date.now(),
  };
}

function setSaveStatus(mode, label) {
  saveState.classList.toggle('is-saving', mode === 'saving');
  saveState.classList.toggle('is-error', mode === 'error');
  saveLabel.textContent = label;
}

function scheduleSave(delay = 2000) {
  window.clearTimeout(saveTimer);
  setSaveStatus('saving', 'Changes pending');
  saveTimer = window.setTimeout(() => { void saveNow(); }, delay);
}

async function saveNow() {
  window.clearTimeout(saveTimer);
  if (!workspaceState) return;
  if (saveInFlight) {
    saveAgain = true;
    return;
  }
  saveInFlight = true;
  saveAgain = false;
  const revisionAtStart = stateRevision;
  setSaveStatus('saving', 'Saving locally…');
  try {
    const snapshot = snapshotWorkspace();
    await writeWorkspace(snapshot);
    void maybeCreateAutomaticHistory(snapshot);
    if (revisionAtStart === stateRevision && !saveAgain) {
      setSaveStatus('saved', 'Saved on this device');
    }
  } catch (error) {
    setSaveStatus('error', 'Local save unavailable');
    console.error('AetherText session save failed:', error);
    showToast('Could not save the session to IndexedDB. Check your browser storage settings.', true);
  } finally {
    saveInFlight = false;
    if (saveAgain || revisionAtStart !== stateRevision) scheduleSave(200);
  }
}

function captureActiveView() {
  if (!workspaceState || !workspaceState.tabs.length) return;
  const tab = currentTab();
  if (document.activeElement === editor || editor.value === tab.text) {
    tab.cursorStart = editor.selectionStart ?? tab.cursorStart;
    tab.cursorEnd = editor.selectionEnd ?? tab.cursorEnd;
  }
  tab.editorScrollTop = editor.scrollTop;
  tab.editorScrollLeft = editor.scrollLeft;
  tab.previewScrollTop = latestPreviewScroll;
  tab.previewScrollLeft = latestPreviewScrollLeft;
}

function escapeCssString(value) {
  return String(value).replace(/[\\"\n\r\f]/g, (character) => {
    if (character === '\\') return '\\\\';
    if (character === '"') return '\\"';
    if (character === '\n') return '\\a ';
    if (character === '\r') return '\\d ';
    return '\\c ';
  }).replace(/[\u0000-\u001f\u007f]/g, ' ');
}

function ensureFontRules() {
  if (fontRulesElement) return fontRulesElement;
  fontRulesElement = document.createElement('style');
  fontRulesElement.id = 'dynamic-font-rules';
  document.head.append(fontRulesElement);
  return fontRulesElement;
}

function registerFontRule(font) {
  if (!font?.id || !font?.family) return;
  const id = font.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  const family = escapeCssString(font.family);
  const fallback = typeof font.fallback === 'string' && /^[\w\s,"'-]+$/.test(font.fallback) ? font.fallback : 'sans-serif';
  const rule = `body[data-font-id="${id}"]{--app-font:"${family}",${fallback};--editor-font:"${family}",${fallback};}`;
  const style = ensureFontRules();
  try {
    const selector = `body[data-font-id="${id}"]`;
    for (let index = style.sheet.cssRules.length - 1; index >= 0; index--) {
      if (style.sheet.cssRules[index].selectorText === selector) style.sheet.deleteRule(index);
    }
    style.sheet.insertRule(rule, style.sheet.cssRules.length);
  } catch (error) {
    console.warn('Could not apply font rule:', error);
  }
}

function applyFont(font, updateSelect = true) {
  if (!font?.family) return;
  registerFontRule(font);
  body.dataset.fontId = font.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  workspaceState.settings.font = { id: body.dataset.fontId, family: font.family, fallback: font.fallback || 'sans-serif' };
  if (updateSelect) {
    const existing = [...fontSelect.options].find((option) => option.value === workspaceState.settings.font.id);
    if (existing) fontSelect.value = existing.value;
    else {
      const option = document.createElement('option');
      option.value = workspaceState.settings.font.id;
      option.textContent = `${workspaceState.settings.font.family} (restored)`;
      option.dataset.dynamic = 'true';
      fontSelect.append(option);
      fontSelect.value = option.value;
    }
  }
  $('#font-label').textContent = font.label || font.family;
  renderPreview(false);
  notifyChange();
}

function applyTheme(themeId, shouldSave = true) {
  const theme = THEMES.find((candidate) => candidate.id === themeId) || THEMES[0];
  body.dataset.theme = theme.id;
  if (theme.id === 'zen-distraction-free') closeReferencePanel();
  workspaceState.settings.theme = theme.id;
  themeSelect.value = theme.id;
  $('#theme-label').textContent = theme.label;
  updateMirror();
  updateThemeColorMeta();
  renderPreview(false);
  if (shouldSave) notifyChange();
}

function resolvedAppearance(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  return media?.matches ? 'dark' : 'light';
}

function normalizeHexColor(value) {
  const hex = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex.slice(1).split('').map((char) => char + char).join('')}`.toLowerCase();
  return '';
}

function hexToRgb(hex) {
  const clean = normalizeHexColor(hex);
  if (!clean) return null;
  return { r: parseInt(clean.slice(1, 3), 16), g: parseInt(clean.slice(3, 5), 16), b: parseInt(clean.slice(5, 7), 16) };
}

function mixHex(first, second, amount) {
  const a = hexToRgb(first); const b = hexToRgb(second);
  if (!a || !b) return first;
  const part = Math.max(0, Math.min(1, amount));
  return `#${[a.r, a.g, a.b].map((channel, index) => Math.round(channel * (1 - part) + [b.r, b.g, b.b][index] * part).toString(16).padStart(2, '0')).join('')}`;
}

function colorLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function applyAccentColor(value = '', shouldSave = true) {
  const accent = normalizeHexColor(value);
  if (workspaceState?.settings) workspaceState.settings.accentColor = accent;
  if (accent) {
    const isDark = body.dataset.appearance === 'dark';
    const luminance = colorLuminance(accent);
    const strong = mixHex(accent, isDark ? '#ffffff' : '#000000', 0.2);
    const text = luminance > 0.42 ? '#111318' : '#ffffff';
    const link = isDark && luminance < 0.35 ? mixHex(accent, '#ffffff', 0.38) : (!isDark && luminance > 0.55 ? mixHex(accent, '#111318', 0.46) : accent);
    body.style.setProperty('--accent', accent);
    body.style.setProperty('--accent-strong', strong);
    body.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 16%, var(--panel))`);
    body.style.setProperty('--accent-text', text);
    body.style.setProperty('--link', link);
    body.style.setProperty('--focus-ring', isDark && luminance < 0.35 ? link : accent);
  } else {
    for (const property of ['--accent', '--accent-strong', '--accent-soft', '--accent-text', '--link', '--focus-ring']) body.style.removeProperty(property);
  }
  const picker = $('#accent-color');
  if (picker) picker.value = accent || getComputedStyle(body).getPropertyValue('--accent').trim() || '#657b68';
  $$('.accent-swatch').forEach((button) => {
    const selected = normalizeHexColor(button.dataset.accentColor) === accent;
    button.classList.toggle('is-selected', Boolean(accent) && selected);
    button.setAttribute('aria-pressed', String(Boolean(accent) && selected));
  });
  updateThemeColorMeta();
  if (shouldSave && workspaceState) notifyChange();
}

function applyEditorPreferences(shouldSave = false) {
  const settings = workspaceState?.settings;
  if (!settings) return;
  const fontSize = Math.max(10, Math.min(20, Math.round(Number(settings.editorFontSize) || 12)));
  const lineHeight = ['compact', 'comfortable', 'spacious'].includes(settings.editorLineHeight) ? settings.editorLineHeight : 'comfortable';
  const tabSize = [2, 4, 8].includes(Number(settings.editorTabSize)) ? Number(settings.editorTabSize) : 4;
  const wordWrap = settings.editorWordWrap !== false;
  const reduceMotion = settings.reduceMotion === true;
  body.style.setProperty('--editor-size', `${fontSize}px`);
  body.style.setProperty('--editor-line-height', ({ compact: 1.5, comfortable: 1.85, spacious: 2.15 })[lineHeight].toString());
  body.style.setProperty('--editor-tab-size', String(tabSize));
  body.dataset.wordWrap = wordWrap ? 'on' : 'off';
  body.dataset.reduceMotion = reduceMotion ? 'on' : 'off';
  editor.setAttribute('wrap', wordWrap ? 'soft' : 'off');
  const fontSizeInput = $('#editor-font-size');
  if (fontSizeInput) fontSizeInput.value = String(fontSize);
  const fontSizeValue = $('#editor-font-size-value');
  if (fontSizeValue) fontSizeValue.textContent = `${fontSize} px`;
  const lineHeightSelect = $('#editor-line-height');
  if (lineHeightSelect) lineHeightSelect.value = lineHeight;
  const tabSizeSelect = $('#editor-tab-size');
  if (tabSizeSelect) tabSizeSelect.value = String(tabSize);
  const wrapToggle = $('#editor-word-wrap');
  if (wrapToggle) wrapToggle.checked = wordWrap;
  const motionToggle = $('#reduce-motion');
  if (motionToggle) motionToggle.checked = reduceMotion;
  if (shouldSave) notifyChange();
}

function updateThemeColorMeta() {
  const meta = $('#theme-color-meta');
  if (!meta) return;
  const appBackground = getComputedStyle(body).getPropertyValue('--app-bg').trim();
  meta.content = appBackground || (body.dataset.appearance === 'dark' ? '#111315' : '#f4f3ef');
}

function applyAppearance(mode = 'system', shouldSave = true, shouldRender = true) {
  const appearance = ['system', 'light', 'dark'].includes(mode) ? mode : 'system';
  if (workspaceState?.settings) workspaceState.settings.appearance = appearance;
  body.dataset.appearanceMode = appearance;
  body.dataset.appearance = resolvedAppearance(appearance);
  if (workspaceState?.settings?.accentColor) applyAccentColor(workspaceState.settings.accentColor, false);
  if (appearanceSelect) appearanceSelect.value = appearance;
  updateThemeColorMeta();
  if (shouldRender && workspaceState) {
    updateMirror();
    renderPreview(false);
  }
  if (shouldSave && workspaceState) notifyChange();
}

function updateFileModeUI() {
  const tab = currentTab();
  if (!tab) return;
  const type = getFileType(tab.name);
  const requestedMode = getPreviewMode(tab.name, { hasAsset: tab.assetBlob instanceof Blob, assetMime: tab.assetMime });
  const mode = requestedMode.startsWith('asset-') && !(tab.assetBlob instanceof Blob) ? 'source-only' : requestedMode;
  const isMarkup = mode === 'browser';
  const editorOnly = mode === 'source-only';
  const assetOnly = mode.startsWith('asset-') && tab.assetBlob instanceof Blob;
  const sourceLabel = $('#source-type-label');
  if (sourceLabel) sourceLabel.textContent = type.label.toUpperCase();
  editor.setAttribute('aria-label', `${type.label} source editor`);
  editor.disabled = assetOnly;
  editor.placeholder = assetOnly ? 'This is a binary file. Use the preview and Export controls.' : 'Start with a thought…';
  $('.editor-pane')?.setAttribute('aria-label', `${type.label} editor`);
  body.classList.toggle('editor-only', editorOnly);
  body.classList.toggle('asset-only', assetOnly);
  body.dataset.previewMode = mode;
  for (const [id, label] of [['insert-heading', 'Insert Markdown heading'], ['insert-bold', 'Wrap selection in Markdown bold'], ['insert-link', 'Insert Markdown link']]) {
    const button = $(`#${id}`);
    if (!button) continue;
    button.disabled = assetOnly || !isMarkdownFile(tab.name);
    button.title = button.disabled ? `${label} (available in Markdown files)` : label;
  }
  const styleButton = $('#toggle-preview-style');
  if (styleButton) {
    styleButton.disabled = !isMarkup;
    styleButton.title = isMarkup
      ? (workspaceState.settings.previewStyle === 'aether' ? 'Switch to File CSS preview' : 'Switch to Aether Theme preview')
      : 'File CSS and Aether Theme apply to Markdown and HTML files';
  }
  const labels = {
    browser: ['Browser', type.label.toUpperCase()],
    'css-demo': ['CSS playground', 'LIVE CSS SAMPLE'],
    'json-data': ['Data preview', 'JSON TREE'],
    'tabular-data': ['Data preview', 'TABLE'],
    'svg-image': ['Visual preview', 'SVG'],
    'asset-image': ['Asset preview', 'IMAGE'],
    'asset-pdf': ['Asset preview', 'PDF'],
    'asset-audio': ['Asset preview', 'AUDIO'],
    'asset-video': ['Asset preview', 'VIDEO'],
    'source-only': ['Source', 'EDITOR ONLY'],
  };
  const [heading, badgeText] = labels[mode] || ['Preview', type.label.toUpperCase()];
  const paneTitle = $('#preview-pane-title');
  if (paneTitle) paneTitle.textContent = heading;
  const badge = $('#preview-style-badge');
  if (badge) {
    badge.textContent = isMarkup
      ? (workspaceState.settings.previewStyle === 'aether' ? 'AETHER THEME' : 'FILE CSS')
      : badgeText;
    badge.title = isMarkup
      ? (workspaceState.settings.previewStyle === 'aether' ? 'Document CSS is suppressed; the selected AetherText theme styles the content.' : 'The document’s own styles are preserved.')
      : mode === 'source-only'
        ? 'This file is source-only, so the preview pane closes automatically.'
        : 'AetherText uses a purpose-built local preview for this file type; source code is not executed.';
  }
  const browserChrome = $('.browser-chrome');
  if (browserChrome) browserChrome.hidden = !isMarkup;
  const browserShell = $('#preview-scroll');
  if (browserShell) browserShell.setAttribute('aria-label', isMarkup ? 'Browser preview viewport' : `${heading} surface`);
  $('.preview-pane')?.setAttribute('aria-label', `${heading} for ${tab.name}`);
  const mobilePreviewButton = $('#toggle-mobile-preview');
  if (mobilePreviewButton) mobilePreviewButton.hidden = editorOnly;
  const liveIndicator = $('.live-indicator');
  if (liveIndicator) liveIndicator.hidden = editorOnly || assetOnly;
  const viewport = viewportSelect;
  if (viewport) viewport.disabled = editorOnly;
  const exportHtml = $('#export-html');
  if (exportHtml) exportHtml.disabled = !isMarkup;
  const jsButton = $('#toggle-preview-js');
  const previewStatus = $('#preview-js-status');
  if (previewStatus && !isMarkup) previewStatus.textContent = editorOnly ? 'Source-only editor' : 'Local file preview · source is not executed';
  const copyButton = $('#copy-markdown');
  if (copyButton) copyButton.disabled = assetOnly;
  for (const id of ['open-find', 'open-snippets', 'open-history']) { const button = $(`#${id}`); if (button) button.disabled = assetOnly; }
  if (jsButton && !isMarkup) {
    jsButton.disabled = true;
    jsButton.textContent = 'JS —';
    jsButton.setAttribute('aria-pressed', 'false');
    jsButton.title = 'JavaScript execution is available only for Markdown/HTML preview documents containing executable code.';
  }
  if (!isMarkup) hideAutocomplete();
}

function applyPreviewStyle(style = 'file', shouldSave = true, shouldRender = true) {
  const previewStyle = style === 'aether' ? 'aether' : 'file';
  if (workspaceState?.settings) workspaceState.settings.previewStyle = previewStyle;
  body.dataset.previewStyle = previewStyle;
  if (previewStyleSelect) previewStyleSelect.value = previewStyle;
  updateFileModeUI();
  const badge = $('#preview-style-badge');
  if (badge) {
    const type = currentTab() ? getFileType(currentTab().name) : getFileType('Untitled.md');
    const markupMode = supportsMarkupPreview(currentTab()?.name || 'Untitled.md');
    badge.textContent = markupMode ? (previewStyle === 'aether' ? 'AETHER THEME' : 'FILE CSS') : `${type.label.toUpperCase()} VIEW`;
    badge.title = markupMode ? (previewStyle === 'aether'
      ? 'Document CSS is suppressed; the selected AetherText theme styles the content.'
      : 'The document’s own styles are preserved.') : 'This source format is shown as inert text; it is not executed or interpreted as markup.';
  }
  const quickToggle = $('#toggle-preview-style');
  if (quickToggle) {
    const markupMode = supportsMarkupPreview(currentTab()?.name || 'Untitled.md');
    const label = !markupMode
      ? 'Preview styling modes apply to Markdown and HTML files'
      : (previewStyle === 'aether' ? 'Switch to File CSS preview' : 'Switch to Aether Theme preview');
    quickToggle.title = label;
    quickToggle.setAttribute('aria-label', label);
    quickToggle.disabled = !markupMode;
  }
  if (shouldRender && workspaceState) renderPreview(false);
  if (shouldSave && workspaceState) notifyChange();
}

function applyViewport(viewportId = 'responsive', shouldSave = true) {
  const viewport = VIEWPORTS.some((item) => item.id === viewportId) ? viewportId : 'responsive';
  workspaceState.settings.previewViewport = viewport;
  body.dataset.previewViewport = viewport;
  if (viewportSelect) viewportSelect.value = viewport;
  if (shouldSave && workspaceState) notifyChange();
}

function applySavedSettings() {
  const themeId = workspaceState.settings.theme;
  body.dataset.theme = THEMES.some((theme) => theme.id === themeId) ? themeId : 'classic-writer';
  themeSelect.value = body.dataset.theme;
  $('#theme-label').textContent = THEMES.find((theme) => theme.id === body.dataset.theme)?.label || 'Classic Writer';
  applyAppearance(workspaceState.settings.appearance || 'system', false, false);
  applyPreviewStyle(workspaceState.settings.previewStyle || 'file', false, false);
  applyViewport(workspaceState.settings.previewViewport || 'responsive', false);
  applyAccentColor(workspaceState.settings.accentColor || '', false);
  applyEditorPreferences(false);
  const font = workspaceState.settings.font || CURATED_FONTS[0];
  registerFontRule(font);
  body.dataset.fontId = font.id;
  $('#font-label').textContent = font.label || font.family || 'System UI';
  populateFontsSelect();
}

function renderTabs() {
  tabsList.replaceChildren();
  workspaceState.tabs.forEach((tab, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = `file-tab${index === workspaceState.activeTabIndex ? ' active' : ''}`;
    wrapper.setAttribute('role', 'tab');
    wrapper.setAttribute('aria-selected', String(index === workspaceState.activeTabIndex));
    wrapper.setAttribute('aria-label', `${tab.name}${tab.dirty ? ', unsaved changes' : ''}`);

    const activate = document.createElement('button');
    activate.type = 'button';
    activate.className = 'tab-main';
    activate.title = tab.name;
    activate.addEventListener('click', () => activateTab(index));

    const mark = document.createElement('span');
    mark.className = 'file-mark';
    mark.textContent = getFileType(tab.name).short;
    mark.setAttribute('aria-hidden', 'true');
    mark.title = getFileType(tab.name).label;
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = tab.name;
    activate.append(mark, name);
    if (tab.dirty) {
      const dot = document.createElement('span');
      dot.className = 'dirty-dot';
      dot.setAttribute('aria-label', 'Unsaved changes');
      activate.append(dot);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close-tab';
    close.textContent = '×';
    close.setAttribute('aria-label', `Close ${tab.name}`);
    close.title = `Close ${tab.name}`;
    close.addEventListener('click', (event) => { event.stopPropagation(); closeTab(index); });
    wrapper.append(activate, close);
    tabsList.append(wrapper);
  });
}

function activateTab(index) {
  if (index < 0 || index >= workspaceState.tabs.length || index === workspaceState.activeTabIndex) return;
  captureActiveView();
  workspaceState.activeTabIndex = index;
  body.classList.remove('preview-visible');
  updateMobilePreviewButton();
  renderTabs();
  renderActiveTab(true);
  notifyChange();
}

function renderActiveTab(restorePosition) {
  hideAutocomplete();
  const tab = currentTab();
  editor.value = tab.text;
  $('#preview-file-name').textContent = tab.name;
  updateFileModeUI();
  renderPreview(false);
  updateCounts();
  updateLineIndicator();
  updateMirror();
  requestAnimationFrame(() => {
    const start = Math.min(tab.cursorStart, editor.value.length);
    const end = Math.min(Math.max(start, tab.cursorEnd), editor.value.length);
    try { editor.setSelectionRange(start, end); } catch { /* some embedded browsers may defer selection */ }
    if (restorePosition) {
      editor.scrollTop = tab.editorScrollTop;
      editor.scrollLeft = tab.editorScrollLeft;
      latestPreviewScroll = tab.previewScrollTop;
      latestPreviewScrollLeft = tab.previewScrollLeft;
    }
    syncMirrorScroll();
    updateMirror();
    updateAutocomplete();
  });
}

function getFallbackPreviewCSS(adaptive = false) {
  const computed = getComputedStyle(body);
  const value = (name, fallback = '') => computed.getPropertyValue(name).trim() || fallback;
  return createFallbackPreviewCSS({
    id: body.dataset.theme,
    background: value('--preview-bg', '#fffefa'),
    ink: value('--preview-ink', '#363732'),
    heading: value('--ink', '#292a28'),
    link: value('--link', '#55745d'),
    codeBackground: value('--code-bg', '#f0f0e9'),
    codeInk: value('--code-ink', '#3c483d'),
    rule: value('--line-strong', '#deddd4'),
    quote: value('--quote-line', '#a5b5a4'),
    font: value('--preview-font', 'Georgia, "Times New Roman", serif'),
    appFont: value('--app-font', 'system-ui, sans-serif'),
    focus: value('--focus-ring', value('--link', '#55745d')),
    appearance: body.dataset.appearance,
    adaptive,
  });
}

function updatePreviewAddress(filename = currentTab()?.name || 'Untitled.md') {
  previewAddress.textContent = `aethertext://preview/${filename}`;
  $('#preview-file-name').textContent = filename;
}

function updateJavaScriptToggle() {
  const tab = currentTab();
  const button = $('#toggle-preview-js');
  const status = $('#preview-js-status');
  if (!tab || !button || !status) return;
  const detected = supportsMarkupPreview(tab.name) && hasDocumentJavaScript(tab.text);
  if (!detected && tab.runJavaScript) {
    tab.runJavaScript = false;
    notifyChange();
  }
  const enabled = detected && tab.runJavaScript === true;
  button.disabled = !detected;
  button.textContent = detected ? (enabled ? 'JS ON' : 'JS OFF') : 'JS —';
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label', detected ? (enabled ? 'Disable JavaScript for this document' : 'Enable JavaScript for this document') : 'No executable JavaScript detected in this document');
  button.title = detected
    ? (enabled ? 'JavaScript is enabled for this document only. Click to disable.' : 'Run JavaScript in this document only (sandboxed)')
    : 'No executable JavaScript detected in this document';
  status.textContent = !detected
    ? 'No document JavaScript detected'
    : enabled
      ? 'JavaScript enabled for this file · isolated preview'
      : 'JavaScript disabled for this file';
}

function toggleDocumentJavaScript() {
  const tab = currentTab();
  if (!tab || !supportsMarkupPreview(tab.name) || !hasDocumentJavaScript(tab.text)) {
    showToast('JavaScript preview is only available for Markdown and HTML documents containing executable code.', true);
    updateJavaScriptToggle();
    return;
  }
  if (tab.runJavaScript !== true) {
    const approved = window.confirm(
      'Run JavaScript for this document only?\n\n' +
      'The code runs inside an isolated preview and cannot directly access AetherText’s workspace or IndexedDB. ' +
      'It can read this document and may make network requests. Enable it only for files and scripts you trust.'
    );
    if (!approved) return;
    tab.runJavaScript = true;
  } else {
    tab.runJavaScript = false;
  }
  updateJavaScriptToggle();
  renderPreview(false);
  notifyChange();
  showToast(`JavaScript ${tab.runJavaScript ? 'enabled' : 'disabled'} for ${tab.name}.`);
}

function releasePreviewAssetURL() {
  if (previewAssetObjectURL) URL.revokeObjectURL(previewAssetObjectURL);
  previewAssetObjectURL = '';
}

function createPreviewElement(tag, className, text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function setPreviewMessage(title, message, detail = '') {
  const section = createPreviewElement('section', 'file-preview-message');
  section.append(createPreviewElement('h2', '', title), createPreviewElement('p', '', message));
  if (detail) section.append(createPreviewElement('pre', 'source-preview-code', detail));
  nonbrowserPreviewSurface.replaceChildren(section);
}

function renderNonBrowserPreview(tab, mode) {
  releasePreviewAssetURL();
  nonbrowserPreviewSurface.replaceChildren();
  nonbrowserPreviewSurface.hidden = false;
  browserPreviewFrame.hidden = true;
  browserPreviewFrame.srcdoc = '';

  if (mode === 'source-only') return;
  if (mode === 'css-demo') {
    if (tab.text.length > 512 * 1024) {
      setPreviewMessage('CSS playground paused', 'This stylesheet is larger than 512 KiB. The source remains editable; a sample preview is paused to keep the editor responsive.');
      return;
    }
    browserPreviewFrame.hidden = false;
    browserPreviewFrame.setAttribute('sandbox', '');
    browserPreviewFrame.title = 'CSS sample preview; author scripts are disabled';
    browserPreviewFrame.srcdoc = buildCSSPlayground(tab.text);
    nonbrowserPreviewSurface.hidden = true;
    return;
  }
  if (mode === 'json-data') {
    const card = createPreviewElement('section', 'data-preview-card');
    if (tab.text.length > 1024 * 1024) {
      card.append(createPreviewElement('h2', '', 'JSON source preview'), createPreviewElement('p', 'preview-notice', 'Structured parsing is paused for files over 1 MiB to keep typing responsive.'), createPreviewElement('pre', 'source-preview-code', tab.text.slice(0, 180000)));
    } else {
      const parsed = parseJSONPreview(tab.text);
      card.append(createPreviewElement('h2', '', parsed.valid ? 'JSON structure' : 'JSON source'), createPreviewElement('p', parsed.valid ? 'Valid JSON · formatted for reading' : `Could not parse JSON: ${parsed.error}`));
      card.append(createPreviewElement('pre', `source-preview-code${parsed.valid ? '' : ' is-invalid'}`, parsed.formatted.slice(0, 300000)));
      if (parsed.formatted.length > 300000) card.append(createPreviewElement('p', 'preview-notice', 'Display truncated at 300,000 characters. The editor contains the full file.'));
    }
    nonbrowserPreviewSurface.append(card);
    return;
  }
  if (mode === 'tabular-data') {
    const delimiter = getFileType(tab.name).extension === '.tsv' ? '\t' : ',';
    const { rows, truncated, columnsTruncated } = parseDelimitedText(tab.text, delimiter, { rowLimit: 100, columnLimit: 20 });
    if (!rows.length) { setPreviewMessage('Empty data file', 'Add a header row and at least one record to preview tabular data.'); return; }
    const card = createPreviewElement('section', 'data-preview-card');
    card.append(createPreviewElement('h2', '', getFileType(tab.name).extension === '.tsv' ? 'TSV table' : 'CSV table'));
    const note = [];
    if (truncated) note.push('Showing the first 100 rows or the safe preview limit.');
    if (columnsTruncated) note.push('Showing the first 20 columns.');
    if (note.length) card.append(createPreviewElement('p', 'preview-notice', note.join(' ')));
    const tableWrap = createPreviewElement('div', 'data-table-wrap');
    const table = createPreviewElement('table', 'data-preview-table');
    const head = createPreviewElement('thead');
    const headRow = createPreviewElement('tr');
    rows[0].forEach((cell, index) => headRow.append(createPreviewElement('th', '', cell || `Column ${index + 1}`)));
    head.append(headRow); table.append(head);
    const bodyRows = createPreviewElement('tbody');
    rows.slice(1).forEach((row) => {
      const tr = createPreviewElement('tr');
      for (let i = 0; i < Math.max(rows[0].length, row.length); i++) tr.append(createPreviewElement('td', '', row[i] ?? ''));
      bodyRows.append(tr);
    });
    table.append(bodyRows); tableWrap.append(table); card.append(tableWrap); nonbrowserPreviewSurface.append(card);
    return;
  }
  if (mode === 'svg-image') {
    if (!/<svg\b/i.test(tab.text)) { setPreviewMessage('SVG preview', 'Add a valid <svg> root element to see the vector preview.'); return; }
    const safeSVG = sanitizeSVGForImage(tab.text);
    const blob = new Blob([safeSVG], { type: 'image/svg+xml;charset=utf-8' });
    previewAssetObjectURL = URL.createObjectURL(blob);
    const card = createPreviewElement('section', 'asset-preview-card svg-preview-card');
    const image = createPreviewElement('img', 'asset-preview-image');
    image.alt = `${tab.name} visual preview`;
    image.src = previewAssetObjectURL;
    card.append(createPreviewElement('h2', '', 'SVG preview'), image);
    nonbrowserPreviewSurface.append(card);
    return;
  }
  if (mode.startsWith('asset-')) {
    if (!(tab.assetBlob instanceof Blob)) { setPreviewMessage('Asset unavailable', 'Reopen this file from disk to restore its binary preview.'); return; }
    const mime = tab.assetMime || tab.assetBlob.type || mimeTypeForFilename(tab.name);
    previewAssetObjectURL = URL.createObjectURL(tab.assetBlob);
    const card = createPreviewElement('section', 'asset-preview-card');
    card.append(createPreviewElement('h2', '', tab.name));
    if (mode === 'asset-image') {
      const image = createPreviewElement('img', 'asset-preview-image'); image.alt = tab.name; image.src = previewAssetObjectURL; card.append(image);
    } else if (mode === 'asset-audio') {
      const audio = createPreviewElement('audio', 'asset-preview-audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = previewAssetObjectURL; card.append(audio);
    } else if (mode === 'asset-video') {
      const video = createPreviewElement('video', 'asset-preview-video'); video.controls = true; video.preload = 'metadata'; video.src = previewAssetObjectURL; card.append(video);
    } else if (mode === 'asset-pdf') {
      const note = createPreviewElement('p', 'preview-notice', 'PDF display depends on the browser’s built-in PDF viewer.');
      const object = createPreviewElement('object', 'asset-preview-pdf'); object.data = previewAssetObjectURL; object.type = mime || 'application/pdf';
      object.append(createPreviewElement('p', '', 'This browser cannot display this PDF inline. Export the file to open it externally.'));
      card.append(note, object);
    }
    card.append(createPreviewElement('p', 'asset-preview-meta', `${(tab.assetBlob.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB · ${mime}`));
    nonbrowserPreviewSurface.append(card);
  }
}

function renderPreview(preserveScroll = true) {
  window.clearTimeout(previewRenderTimer);
  const tab = currentTab();
  if (!tab) return;
  const tabId = tab.id;
  previewRestoreScroll = preserveScroll
    ? { x: latestPreviewScrollLeft, y: latestPreviewScroll }
    : { x: tab.previewScrollLeft, y: tab.previewScrollTop };
  updatePreviewAddress(tab.name);
  updateJavaScriptToggle();
  updateFileModeUI();
  const requestedMode = getPreviewMode(tab.name, { hasAsset: tab.assetBlob instanceof Blob, assetMime: tab.assetMime });
  const mode = requestedMode.startsWith('asset-') && !(tab.assetBlob instanceof Blob) ? 'source-only' : requestedMode;
  if (mode === 'source-only') {
    releasePreviewAssetURL();
    nonbrowserPreviewSurface.replaceChildren();
    nonbrowserPreviewSurface.hidden = true;
    browserPreviewFrame.hidden = true;
    browserPreviewFrame.srcdoc = '';
    return;
  }
  // A short debounce prevents rebuilding a full document/table on every keystroke.
  previewRenderTimer = window.setTimeout(() => {
    if (currentTab()?.id !== tabId) return;
    const active = currentTab();
    if (!active) return;
    if (mode !== 'browser') {
      if (mode !== 'css-demo') renderNonBrowserPreview(active, mode);
      else renderNonBrowserPreview(active, mode);
      const address = $('#preview-address');
      if (address) address.textContent = `local preview · ${active.name}`;
      return;
    }
    releasePreviewAssetURL();
    nonbrowserPreviewSurface.replaceChildren();
    nonbrowserPreviewSurface.hidden = true;
    browserPreviewFrame.hidden = false;
    browserPreviewFrame.setAttribute('sandbox', 'allow-scripts allow-popups');
    browserPreviewFrame.title = 'Rendered HTML and CSS document';
    const previewStyle = workspaceState.settings.previewStyle || 'file';
    const documentHTML = buildBrowserDocument(active.text, { filename: active.name, previewStyle, runJavaScript: active.runJavaScript === true, fallbackCSS: getFallbackPreviewCSS(previewStyle === 'aether') });
    browserPreviewFrame.srcdoc = documentHTML;
  }, 240);
}

function updateCounts() {
  const active = currentTab();
  if (active?.assetBlob instanceof Blob) {
    $('#word-count').textContent = 'Binary asset';
    $('#char-count').textContent = `${(active.assetBlob.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`;
    $('#reading-time').textContent = 'Preview only';
    return;
  }
  const text = editor.value;
  const trimmed = text.trim();
  const words = trimmed ? (trimmed.match(/\S+/g) || []).length : 0;
  const characters = Array.from(text).length;
  $('#word-count').textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
  $('#char-count').textContent = `${characters.toLocaleString()} ${characters === 1 ? 'character' : 'characters'}`;
  $('#reading-time').textContent = `${Math.max(1, Math.ceil(words / 220))} min read`;
}

function updateLineIndicator() {
  const cursor = editor.selectionStart ?? 0;
  const before = editor.value.slice(0, cursor);
  const lines = before.split('\n');
  $('#line-indicator').textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

function updateMirror() {
  if (body.dataset.theme !== 'typewriter-focus') return;
  const text = editor.value;
  const activeLineIndex = text.slice(0, editor.selectionStart ?? 0).split('\n').length - 1;
  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const span = document.createElement('span');
    span.className = `mirror-line${index === activeLineIndex ? ' is-active' : ' is-dim'}`;
    // textContent safely mirrors the source without parsing it as HTML.
    span.textContent = line || '\u200b';
    fragment.append(span);
  });
  mirror.replaceChildren(fragment);
  syncMirrorScroll();
  if (document.activeElement === editor) centerActiveLine();
}

function syncMirrorScroll() {
  mirror.scrollTop = editor.scrollTop;
  mirror.scrollLeft = editor.scrollLeft;
}

function centerActiveLine() {
  if (body.dataset.theme !== 'typewriter-focus' || document.activeElement !== editor) return;
  const cursor = editor.selectionStart ?? 0;
  const lineIndex = editor.value.slice(0, cursor).split('\n').length - 1;
  const style = getComputedStyle(editor);
  const lineHeight = Number.parseFloat(style.lineHeight) || 22;
  const target = Math.max(0, lineIndex * lineHeight - (editor.clientHeight / 2) + lineHeight / 2);
  if (Math.abs(editor.scrollTop - target) > lineHeight * 1.25) editor.scrollTop = target;
  syncMirrorScroll();
}

function hideAutocomplete() {
  if (!autocompletePopup) return;
  autocompletePopup.hidden = true;
  autocompletePopup.replaceChildren();
  autocompleteItems = [];
  autocompleteContext = null;
  activeAutocompleteIndex = 0;
  editor?.setAttribute('aria-expanded', 'false');
  editor?.removeAttribute('aria-activedescendant');
}

function positionAutocompletePopup() {
  if (!autocompletePopup || autocompletePopup.hidden) return;
  const context = autocompleteContext;
  if (!context) return;
  const valueBeforeCaret = editor.value.slice(0, editor.selectionStart || 0);
  const lines = valueBeforeCaret.split('\n');
  const lineIndex = lines.length - 1;
  const currentLine = lines.at(-1) || '';
  const style = getComputedStyle(editor);
  const lineHeight = Number.parseFloat(style.lineHeight) || 22;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  let textWidth = 0;
  try {
    const canvas = positionAutocompletePopup.canvas || (positionAutocompletePopup.canvas = document.createElement('canvas'));
    const context2d = canvas.getContext('2d');
    if (context2d) {
      context2d.font = style.font;
      textWidth = context2d.measureText(currentLine).width;
    }
  } catch { /* The menu remains usable in browsers without canvas metrics. */ }
  const popupWidth = Math.min(270, Math.max(180, editorWrap.clientWidth - 16));
  const approximateLeft = paddingLeft + textWidth - editor.scrollLeft;
  const left = Math.max(8, Math.min(editorWrap.clientWidth - popupWidth - 8, approximateLeft));
  // Logical-line placement is intentionally cheap; cap it within the visible editor even for long files.
  const approximateTop = paddingTop + lineIndex * lineHeight - editor.scrollTop + lineHeight + 5;
  const top = Math.max(8, Math.min(editorWrap.clientHeight - Math.min(220, autocompletePopup.offsetHeight || 220) - 8, approximateTop));
  autocompletePopup.style.left = `${left}px`;
  autocompletePopup.style.top = `${top}px`;
}

function updateAutocomplete() {
  if (!autocompletePopup || !workspaceState || workspaceState.settings.autocomplete === false || document.activeElement !== editor || !supportsMarkupPreview(currentTab()?.name || 'Untitled.md')) {
    hideAutocomplete();
    return;
  }
  const context = getTagCompletionContext(editor.value, editor.selectionStart);
  if (!context) {
    dismissedAutocompleteKey = '';
    hideAutocomplete();
    return;
  }
  const previousKey = autocompleteContext ? `${autocompleteContext.start}:${autocompleteContext.prefix}:${autocompleteContext.closing}` : '';
  const nextKey = `${context.start}:${context.prefix}:${context.closing}`;
  if (dismissedAutocompleteKey && dismissedAutocompleteKey !== nextKey) dismissedAutocompleteKey = '';
  if (dismissedAutocompleteKey === nextKey) {
    hideAutocomplete();
    return;
  }
  if (previousKey !== nextKey) activeAutocompleteIndex = 0;
  autocompleteContext = context;
  autocompleteItems = suggestHTMLTags(context.prefix, context.closing, 9);
  if (!autocompleteItems.length) {
    hideAutocomplete();
    return;
  }
  autocompletePopup.replaceChildren();
  autocompleteItems.forEach((tag, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `autocomplete-option${index === activeAutocompleteIndex ? ' is-active' : ''}`;
    option.id = `autocomplete-option-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === activeAutocompleteIndex));
    const syntax = document.createElement('span');
    syntax.className = 'autocomplete-syntax';
    syntax.textContent = `<${context.closing ? '/' : ''}${tag}>`;
    const note = document.createElement('span');
    note.className = 'autocomplete-note';
    note.textContent = context.closing ? 'close tag' : (tag === 'style' ? 'stylesheet' : tag === 'div' ? 'container' : 'HTML element');
    option.append(syntax, note);
    option.addEventListener('mousedown', (event) => event.preventDefault());
    option.addEventListener('click', () => acceptAutocomplete(index));
    autocompletePopup.append(option);
  });
  autocompletePopup.hidden = false;
  editor.setAttribute('aria-expanded', 'true');
  editor.setAttribute('aria-controls', 'autocomplete-popup');
  editor.setAttribute('aria-activedescendant', `autocomplete-option-${activeAutocompleteIndex}`);
  positionAutocompletePopup();
}

function acceptAutocomplete(index = activeAutocompleteIndex) {
  const context = autocompleteContext || getTagCompletionContext(editor.value, editor.selectionStart);
  const tag = autocompleteItems[index];
  if (!context || !tag) return false;
  const result = completeTagToken(editor.value, context, tag);
  if (result.text === editor.value) return false;
  editor.value = result.text;
  editor.setSelectionRange(result.cursor, result.cursor);
  hideAutocomplete();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.focus({ preventScroll: true });
  return true;
}

function applyEditorEdit(edit) {
  if (!edit || !Number.isInteger(edit.start) || !Number.isInteger(edit.end)) return false;
  editor.value = `${editor.value.slice(0, edit.start)}${edit.insert}${editor.value.slice(edit.end)}`;
  editor.setSelectionRange(edit.cursor, edit.cursor);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function moveEditorCaret(position) {
  editor.setSelectionRange(position, position);
  const tab = currentTab();
  tab.cursorStart = tab.cursorEnd = position;
  updateLineIndicator();
  updateMirror();
  updateAutocomplete();
}

function handleEditorKeydown(event) {
  if (document.activeElement !== editor || event.ctrlKey || event.metaKey || event.altKey) return;

  if (!autocompletePopup.hidden) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      activeAutocompleteIndex = (activeAutocompleteIndex + direction + autocompleteItems.length) % autocompleteItems.length;
      $$('.autocomplete-option', autocompletePopup).forEach((option, index) => {
        option.classList.toggle('is-active', index === activeAutocompleteIndex);
        option.setAttribute('aria-selected', String(index === activeAutocompleteIndex));
      });
      editor.setAttribute('aria-activedescendant', `autocomplete-option-${activeAutocompleteIndex}`);
      $$('.autocomplete-option', autocompletePopup)[activeAutocompleteIndex]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      acceptAutocomplete();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (autocompleteContext) dismissedAutocompleteKey = `${autocompleteContext.start}:${autocompleteContext.prefix}:${autocompleteContext.closing}`;
      hideAutocomplete();
      return;
    }
  }

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const settings = workspaceState?.settings || {};
  if (settings.autoCloseTags !== false && supportsMarkupPreview(currentTab()?.name || 'Untitled.md') && event.key === '>' && start === end) {
    const edit = getTagAutoCloseEdit(editor.value, start);
    if (edit) {
      event.preventDefault();
      hideAutocomplete();
      applyEditorEdit(edit);
      return;
    }
  }

  if (settings.autoCloseTags !== false && event.key === 'Backspace' && start === end && start > 0) {
    const before = editor.value[start - 1];
    const after = editor.value[start];
    const expected = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }[before];
    if (expected && after === expected) {
      event.preventDefault();
      applyEditorEdit({ start: start - 1, end: start + 1, insert: '', cursor: start - 1 });
      return;
    }
  }

  if (settings.autoCloseTags !== false && ['(', '[', '{', '"', "'", '`', ')', ']', '}'].includes(event.key)) {
    const edit = getPairedDelimiterEdit(editor.value, start, end, event.key);
    if (edit?.skip) {
      event.preventDefault();
      moveEditorCaret(edit.cursor);
      return;
    }
    if (edit) {
      event.preventDefault();
      applyEditorEdit(edit);
      return;
    }
  }

  // Tab inserts a small indentation step in the editor instead of moving focus away.
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    applyEditorEdit({ start, end, insert: '    ', cursor: start + 4 });
  }
}

function onEditorInput() {
  const tab = currentTab();
  tab.text = editor.value;
  tab.dirty = true;
  tab.cursorStart = editor.selectionStart;
  tab.cursorEnd = editor.selectionEnd;
  updateCounts();
  updateLineIndicator();
  updateMirror();
  renderPreview(true);
  renderTabs();
  notifyChange();
  updateAutocomplete();
}

function sendPreviewScroll(x, y) {
  if (!browserPreviewFrame.contentWindow) return;
  suppressPreviewScrollUntil = performance.now() + 220;
  browserPreviewFrame.contentWindow.postMessage({
    aetherTextHost: true, type: 'scroll-to', x: Math.max(0, x || 0), y: Math.max(0, y || 0),
  }, '*');
}

function syncScrollFromEditor() {
  if (isSyncingScroll) return;
  captureEditorScroll();
  positionAutocompletePopup();
  const ratio = editor.scrollHeight > editor.clientHeight ? editor.scrollTop / (editor.scrollHeight - editor.clientHeight) : 0;
  const previewMax = Math.max(0, previewMetrics.height - previewMetrics.viewport);
  sendPreviewScroll(editor.scrollLeft, ratio * previewMax);
  syncMirrorScroll();
  scheduleSave();
}

function handleBrowserPreviewMessage(event) {
  if (event.source !== browserPreviewFrame.contentWindow || event.data?.aetherTextPreview !== true || event.data?.type !== 'scroll') return;
  const data = event.data;
  latestPreviewScroll = Math.max(0, Number(data.y) || 0);
  latestPreviewScrollLeft = Math.max(0, Number(data.x) || 0);
  previewMetrics = {
    height: Math.max(0, Number(data.height) || 0),
    viewport: Math.max(1, Number(data.viewport) || 1),
  };
  const tab = currentTab();
  if (tab) {
    tab.previewScrollTop = latestPreviewScroll;
    tab.previewScrollLeft = latestPreviewScrollLeft;
  }

  // Programmatic sync from the editor must not feed back into the editor.
  if (performance.now() < suppressPreviewScrollUntil) {
    scheduleSave();
    return;
  }
  isSyncingScroll = true;
  const ratio = previewMetrics.height > previewMetrics.viewport
    ? latestPreviewScroll / (previewMetrics.height - previewMetrics.viewport)
    : 0;
  const editorMax = Math.max(0, editor.scrollHeight - editor.clientHeight);
  editor.scrollTop = ratio * editorMax;
  syncMirrorScroll();
  requestAnimationFrame(() => { isSyncingScroll = false; });
  scheduleSave();
}

function handleBrowserPreviewLoad() {
  const saved = previewRestoreScroll || { x: 0, y: currentTab()?.previewScrollTop || 0 };
  const targetX = Math.max(0, saved.x || 0);
  const targetY = Math.max(0, saved.y || 0);
  latestPreviewScrollLeft = targetX;
  latestPreviewScroll = targetY;
  sendPreviewScroll(targetX, targetY);
  // A second request handles documents whose CSS causes a late layout shift.
  window.setTimeout(() => sendPreviewScroll(targetX, targetY), 80);
}

function captureEditorScroll() {
  const tab = currentTab();
  if (!tab) return;
  tab.editorScrollTop = editor.scrollTop;
  tab.editorScrollLeft = editor.scrollLeft;
  tab.cursorStart = editor.selectionStart ?? tab.cursorStart;
  tab.cursorEnd = editor.selectionEnd ?? tab.cursorEnd;
}

function capturePreviewScroll() {
  const tab = currentTab();
  if (!tab) return;
  tab.previewScrollTop = latestPreviewScroll;
  tab.previewScrollLeft = latestPreviewScrollLeft;
}

function nextUntitledFilename(extension = '.md') {
  const ext = extension || '.md';
  const names = new Set(workspaceState.tabs.map((tab) => tab.name.toLowerCase()));
  let candidate = `Untitled${ext}`;
  let number = 2;
  while (names.has(candidate.toLowerCase())) candidate = `Untitled-${number++}${ext}`;
  return candidate;
}

function openNewFileDialog() {
  closeReferencePanel();
  const defaultType = newFileType?.value || 'markdown';
  const choice = getNewFileTypes().find((item) => item.id === defaultType) || getNewFileTypes()[0];
  if (newFileName) newFileName.value = nextUntitledFilename(choice.extension || '.txt');
  if (newFileType) newFileType.value = choice.id;
  openModal(newFileBackdrop, newFileName);
}

function closeNewFileDialog() { closeModal(newFileBackdrop); }

function createNewFile() {
  const choice = getNewFileTypes().find((item) => item.id === newFileType.value) || getNewFileTypes()[0];
  const name = cleanFilename(newFileName.value, choice.extension || '.txt');
  if (!name || name.length > 120) { showToast('Choose a shorter, valid file name.', true); return; }
  captureActiveView();
  const tab = makeTab(name, '');
  tab.dirty = true;
  workspaceState.tabs.push(tab);
  workspaceState.activeTabIndex = workspaceState.tabs.length - 1;
  body.classList.remove('preview-visible');
  updateMobilePreviewButton();
  renderTabs();
  renderActiveTab(false);
  closeNewFileDialog();
  requestAnimationFrame(() => editor.focus());
  notifyChange();
  showToast(`Created ${name}`);
}

function openLocalFiles() {
  if (!importFilesInput) return;
  importFilesInput.value = '';
  importFilesInput.click();
}

async function importSelectedFiles() {
  const files = [...(importFilesInput?.files || [])];
  if (!files.length) return;
  captureActiveView();
  let imported = 0;
  const skipped = [];
  for (const file of files) {
    if (file.size > IMPORT_MAX_BYTES) {
      skipped.push(`${file.name} (over 8 MB)`);
      continue;
    }
    try {
      const safeImportedName = String(file.name).trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.+$/, '').slice(0, 120) || 'Untitled.txt';
      const declaredType = getFileType(safeImportedName);
      const looksLikeAsset = isAssetFile(safeImportedName) || (declaredType.id !== 'svg' && (/^(image|audio|video)\//i.test(file.type) || file.type === 'application/pdf'));
      if (looksLikeAsset) {
        const assetMime = file.type || declaredType.mime || 'application/octet-stream';
        const assetTab = makeTab(safeImportedName, '');
        assetTab.assetBlob = file.slice(0, file.size, assetMime);
        assetTab.assetMime = assetMime;
        assetTab.dirty = false;
        assetTab.cursorStart = assetTab.cursorEnd = 0;
        assetTab.editorScrollTop = assetTab.editorScrollLeft = assetTab.previewScrollTop = assetTab.previewScrollLeft = 0;
        workspaceState.tabs.push(assetTab);
        imported++;
        continue;
      }
      const text = await file.text();
      if (looksLikeBinaryText(text)) {
        skipped.push(`${file.name} (appears to be binary)`);
        continue;
      }
      const tab = makeTab(safeImportedName, text);

      tab.dirty = false;
      tab.cursorStart = tab.cursorEnd = 0;
      tab.editorScrollTop = tab.editorScrollLeft = tab.previewScrollTop = tab.previewScrollLeft = 0;
      workspaceState.tabs.push(tab);
      imported++;
    } catch (error) {
      console.warn(`Could not import ${file.name}:`, error);
      skipped.push(`${file.name} (could not be read)`);
    }
  }
  if (importFilesInput) importFilesInput.value = '';
  if (imported) {
    workspaceState.activeTabIndex = workspaceState.tabs.length - 1;
    body.classList.remove('preview-visible');
    updateMobilePreviewButton();
    renderTabs();
    renderActiveTab(false);
    notifyChange();
  }
  if (skipped.length) {
    const sample = skipped.slice(0, 3).join(', ');
    showToast(`${imported} file(s) opened; skipped ${skipped.length}: ${sample}${skipped.length > 3 ? ', …' : ''}`, true);
  } else {
    showToast(`Opened ${imported} file${imported === 1 ? '' : 's'} in new tabs`);
  }
}

function closeTab(index) {
  const tab = workspaceState.tabs[index];
  if (!tab) return;
  if (tab.dirty && !window.confirm(`“${tab.name}” has changes that haven't been exported. Close it anyway?`)) return;
  captureActiveView();
  workspaceState.tabs.splice(index, 1);
  if (!workspaceState.tabs.length) workspaceState.tabs.push({ ...makeTab('Untitled.md', ''), dirty: false });
  if (workspaceState.activeTabIndex > index) workspaceState.activeTabIndex--;
  else if (workspaceState.activeTabIndex === index) workspaceState.activeTabIndex = Math.min(index, workspaceState.tabs.length - 1);
  renderTabs();
  renderActiveTab(true);
  notifyChange();
}

function downloadText(text, filename, mimeType = 'text/markdown;charset=utf-8') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadBlob(blob, filename, mimeType = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportActiveFile() {
  const tab = currentTab();
  if (!tab) return;
  const currentType = getFileType(tab.name);
  const filename = cleanFilename(tab.name, currentType.extension || '.md');
  if (tab.assetBlob instanceof Blob) downloadBlob(tab.assetBlob, filename, tab.assetMime || mimeTypeForFilename(filename));
  else downloadText(tab.text, filename, mimeTypeForFilename(filename));
  tab.name = filename;
  tab.dirty = false;
  renderTabs();
  updateFileModeUI();
  updatePreviewAddress(tab.name);
  renderPreview(false);
  notifyChange();
  showToast(`Exported ${filename}`);
}

function insertAroundSelection(before, after = '', placeholder = '') {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || placeholder;
  const next = `${editor.value.slice(0, start)}${before}${selected}${after}${editor.value.slice(end)}`;
  editor.value = next;
  const selectionStart = start + before.length;
  const selectionEnd = selectionStart + selected.length;
  editor.focus();
  editor.setSelectionRange(selectionStart, selectionEnd);
  onEditorInput();
}

function insertHeading() {
  const start = editor.selectionStart;
  const before = editor.value.slice(0, start);
  const prefix = before.length === 0 || before.endsWith('\n') ? '# ' : '\n# ';
  insertAroundSelection(prefix, '', 'Heading');
}
function insertBold() { insertAroundSelection('**', '**', 'bold text'); }
function insertLink() { insertAroundSelection('[', '](https://example.com)', 'link text'); }

async function copyMarkdown() {
  if (currentTab()?.assetBlob instanceof Blob) { showToast('Binary assets cannot be copied as text.', true); return; }
  try {
    await navigator.clipboard.writeText(currentTab().text);
    showToast('Source copied to clipboard');
  } catch {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.focus();
    editor.select();
    const succeeded = document.execCommand?.('copy');
    editor.setSelectionRange(start, end);
    if (succeeded) showToast('Source copied to clipboard');
    else showToast('Clipboard access is unavailable in this browser context.', true);
  }
}

function openReferencePanel() {
  body.classList.remove('preview-visible');
  updateMobilePreviewButton();
  body.classList.add('reference-open');
  referencePanel.setAttribute('aria-hidden', 'false');
  $('#toggle-reference').setAttribute('aria-pressed', 'true');
  window.setTimeout(() => referenceUrl.focus(), 120);
}
function closeReferencePanel() {
  body.classList.remove('reference-open');
  referencePanel.setAttribute('aria-hidden', 'true');
  $('#toggle-reference').setAttribute('aria-pressed', 'false');
}
function toggleReferencePanel() {
  if (body.classList.contains('reference-open')) closeReferencePanel();
  else openReferencePanel();
}

function updateMobilePreviewButton() {
  const showingPreview = body.classList.contains('preview-visible');
  const button = $('#toggle-mobile-preview');
  if (!button) return;
  button.setAttribute('aria-label', showingPreview ? 'Show editor' : 'Show preview');
  button.title = showingPreview ? 'Show Markdown editor' : 'Show rendered preview';
  button.setAttribute('aria-pressed', String(showingPreview));
}

function toggleMobilePreview() {
  if (body.classList.contains('reference-open')) closeReferencePanel();
  body.classList.toggle('preview-visible');
  updateMobilePreviewButton();
}
function normaliseReferenceURL(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    return url.href;
  } catch { return null; }
}
function loadReference(raw) {
  const url = normaliseReferenceURL(raw);
  if (!url) {
    showToast('Enter a valid http or https URL.', true);
    referenceUrl.focus();
    return;
  }
  referenceUrl.value = url;
  referenceFrame.src = url;
  referenceEmpty.classList.add('is-hidden');
  referenceLoaded = true;
  workspaceState.referenceUrl = url;
  notifyChange();
}

function currentSearchOptions() {
  return {
    regex: $('#find-regex').checked,
    caseSensitive: $('#find-case-sensitive').checked,
    wholeWord: $('#find-whole-word').checked,
  };
}

function refreshFindMatches() {
  const query = $('#find-input').value;
  try {
    currentFindMatches = findOccurrences(editor.value, query, currentSearchOptions());
    activeFindMatchIndex = -1;
    $('#find-status').textContent = query
      ? (currentFindMatches.length ? `${currentFindMatches.length.toLocaleString()} match${currentFindMatches.length === 1 ? '' : 'es'} found.` : 'No matches in this document.')
      : 'Enter text to begin searching.';
  } catch (error) {
    currentFindMatches = [];
    $('#find-status').textContent = `Invalid pattern: ${error.message}`;
  }
}

function openFind(openWithReplace = false) {
  closeReferencePanel();
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (selected && !selected.includes('\n') && selected.length < 200) $('#find-input').value = selected;
  openModal(findBackdrop, $('#find-input'));
  refreshFindMatches();
  if (openWithReplace) $('#replace-input').focus();
}
function closeFind() { closeModal(findBackdrop); }

function findNextMatch() {
  refreshFindMatches();
  if (!currentFindMatches.length) return;
  const selectionEnd = editor.selectionEnd ?? 0;
  let next = currentFindMatches.findIndex((match) => match.index >= selectionEnd);
  if (next < 0) next = 0;
  activeFindMatchIndex = next;
  const match = currentFindMatches[next];
  editor.focus();
  editor.setSelectionRange(match.index, match.index + match.length);
  updateLineIndicator();
  currentTab().cursorStart = match.index;
  currentTab().cursorEnd = match.index + match.length;
  $('#find-status').textContent = `Match ${next + 1} of ${currentFindMatches.length.toLocaleString()}.`;
  scheduleSave();
}

function replaceOneMatch() {
  const query = $('#find-input').value;
  if (!query) return;
  refreshFindMatches();
  const match = currentFindMatches.find((item) => item.index === editor.selectionStart && item.length === editor.selectionEnd - editor.selectionStart);
  if (!match) { findNextMatch(); return; }
  try {
    const replaced = replaceOccurrenceAt(editor.value, query, $('#replace-input').value, currentSearchOptions(), match.index);
    if (!replaced.count) { findNextMatch(); return; }
    editor.value = replaced.text;
    const caret = match.index + replaced.replacementLength;
    editor.setSelectionRange(caret, caret);
    onEditorInput();
    refreshFindMatches();
    findNextMatch();
    showToast('One match replaced.');
  } catch (error) {
    $('#find-status').textContent = `Could not replace: ${error.message}`;
  }
}

function replaceAllMatches() {
  const query = $('#find-input').value;
  if (!query) return;
  try {
    const result = replaceOccurrences(editor.value, query, $('#replace-input').value, currentSearchOptions(), true);
    if (!result.count) { refreshFindMatches(); showToast('No matches to replace.'); return; }
    editor.value = result.text;
    editor.setSelectionRange(Math.min(editor.value.length, editor.selectionStart), Math.min(editor.value.length, editor.selectionStart));
    onEditorInput();
    refreshFindMatches();
    showToast(`Replaced ${result.count.toLocaleString()} match${result.count === 1 ? '' : 'es'}.`);
  } catch (error) {
    $('#find-status').textContent = `Could not replace: ${error.message}`;
  }
}

function insertSnippetText(text) {
  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? start;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  const prefix = before && !before.endsWith('\n') && !String(text).startsWith('\n') ? '\n' : '';
  const suffix = after && !after.startsWith('\n') && !String(text).endsWith('\n') ? '\n' : '';
  const insertion = `${prefix}${text}${suffix}`;
  editor.value = `${before}${insertion}${after}`;
  const caret = start + insertion.length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  onEditorInput();
}

function renderSnippetList() {
  const root = $('#snippet-list');
  if (!root) return;
  const term = ($('#snippet-search').value || '').trim().toLowerCase();
  const filtered = SNIPPETS.filter((snippet) => (currentSnippetCategory === 'All' || snippet.category === currentSnippetCategory)
    && `${snippet.label} ${snippet.description} ${snippet.text}`.toLowerCase().includes(term));
  root.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'No snippets match that filter.'; root.append(empty); return;
  }
  for (const snippet of filtered) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'snippet-item';
    const heading = document.createElement('span'); heading.className = 'snippet-item-heading'; heading.textContent = snippet.label;
    const description = document.createElement('span'); description.className = 'snippet-item-description'; description.textContent = `${snippet.category} · ${snippet.description}`;
    const preview = document.createElement('code'); preview.className = 'snippet-item-preview'; preview.textContent = snippet.text.split('\n').slice(0, 3).join('\n');
    button.append(heading, description, preview);
    button.addEventListener('click', () => { insertSnippetText(snippet.text); closeSnippets(); showToast(`${snippet.label} inserted.`); });
    root.append(button);
  }
}

function openSnippets() {
  closeReferencePanel();
  currentSnippetCategory = $('#snippet-category').value || 'All';
  renderSnippetList();
  openModal(snippetsBackdrop, $('#snippet-search'));
}
function closeSnippets() { closeModal(snippetsBackdrop); }

function wordCount(text) {
  const trimmed = String(text ?? '').trim();
  return trimmed ? (trimmed.match(/\S+/g) || []).length : 0;
}

function makeHistoryRecord(tab, label = 'Automatic checkpoint') {
  return { id: makeId(), tabId: tab.id, name: tab.name, text: tab.text, createdAt: Date.now(), wordCount: wordCount(tab.text), label };
}

async function maybeCreateAutomaticHistory(snapshot) {
  const now = Date.now();
  for (const tab of snapshot.tabs) {
    if (!tab.text.trim() || now - (lastHistoryCheck.get(tab.id) || 0) < 30000) continue;
    lastHistoryCheck.set(tab.id, now);
    try {
      let last = lastHistorySnapshots.get(tab.id);
      if (!last) {
        const versions = await listHistory(tab.id, 1);
        if (versions[0]) last = { text: versions[0].text, createdAt: versions[0].createdAt };
      }
      if (!last || (last.text !== tab.text && now - last.createdAt >= 60000)) {
        const version = makeHistoryRecord(tab);
        await writeHistoryVersion(version, 40);
        last = { text: tab.text, createdAt: version.createdAt };
      }
      if (last) lastHistorySnapshots.set(tab.id, last);
    } catch (error) {
      console.warn('AetherText automatic history checkpoint failed:', error);
    }
  }
}

async function createHistoryCheckpoint() {
  const tab = currentTab();
  if (!tab) return;
  if (historyBusy) return;
  historyBusy = true;
  $('#create-checkpoint').disabled = true;
  try {
    const latest = await listHistory(tab.id, 1);
    if (latest[0]?.text === tab.text) {
      showToast('The latest checkpoint already contains this draft.');
    } else {
      const version = makeHistoryRecord(tab, 'Manual checkpoint');
      await writeHistoryVersion(version, 40);
      lastHistorySnapshots.set(tab.id, { text: tab.text, createdAt: version.createdAt });
      showToast('Document checkpoint saved locally.');
    }
    await renderHistoryList();
  } catch (error) {
    console.error('AetherText checkpoint failed:', error);
    showToast('Could not save a document checkpoint.', true);
  } finally {
    historyBusy = false;
    $('#create-checkpoint').disabled = false;
  }
}

function readableTimestamp(timestamp) {
  try { return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return new Date(timestamp).toLocaleString(); }
}

async function renderHistoryList() {
  const tab = currentTab();
  historyList.replaceChildren();
  $('#history-subtitle').textContent = `History for ${tab.name}`;
  try {
    const versions = await listHistory(tab.id, 40);
    if (!versions.length) {
      const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'No checkpoints yet. AetherText creates automatic checkpoints as a draft evolves; you can also create one now.'; historyList.append(empty); return;
    }
    for (const version of versions) {
      const card = document.createElement('article'); card.className = 'history-item';
      const copy = document.createElement('div'); copy.className = 'history-item-copy';
      const title = document.createElement('strong'); title.textContent = version.label || 'Checkpoint';
      const meta = document.createElement('span'); meta.textContent = `${readableTimestamp(version.createdAt)} · ${Number(version.wordCount || 0).toLocaleString()} words`;
      const excerpt = document.createElement('p'); excerpt.textContent = (version.text || '(Empty document)').slice(0, 180).replace(/\s+/g, ' ');
      copy.append(title, meta, excerpt);
      const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'secondary-button'; restore.textContent = 'Restore';
      restore.addEventListener('click', () => { void restoreHistoryVersion(version.id); });
      card.append(copy, restore); historyList.append(card);
    }
  } catch (error) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Document history is unavailable in this browser.'; historyList.append(empty);
    console.error('AetherText history list failed:', error);
  }
}

async function openHistory() {
  closeReferencePanel();
  openModal(historyBackdrop, $('#create-checkpoint'));
  await renderHistoryList();
}
function closeHistory() { closeModal(historyBackdrop); }

async function restoreHistoryVersion(versionId) {
  const tab = currentTab();
  try {
    const versions = await listHistory(tab.id, 40);
    const version = versions.find((item) => item.id === versionId);
    if (!version) { showToast('That checkpoint is no longer available.', true); return; }
    if (!window.confirm(`Restore the draft from ${readableTimestamp(version.createdAt)}? The current text will be preserved as a checkpoint first.`)) return;
    if (tab.text !== version.text) await writeHistoryVersion(makeHistoryRecord(tab, 'Before restore'), 40);
    tab.text = version.text;
    tab.dirty = true;
    tab.cursorStart = tab.cursorEnd = 0;
    lastHistorySnapshots.set(tab.id, { text: version.text, createdAt: version.createdAt });
    renderTabs();
    renderActiveTab(false);
    onEditorInput();
    closeHistory();
    showToast(`Restored ${version.name || tab.name} from history.`);
  } catch (error) {
    console.error('AetherText history restore failed:', error);
    showToast('Could not restore this checkpoint.', true);
  }
}

async function exportActiveHTML() {
  const tab = currentTab();
  if (supportsMarkupPreview(tab.name) && tab.runJavaScript === true && hasDocumentJavaScript(tab.text)) {
    const approved = window.confirm(
      'This HTML export will include the active document’s JavaScript.\n\n' +
      'When opened separately, exported scripts run outside AetherText’s preview sandbox. ' +
      'Only export code you trust. Continue?'
    );
    if (!approved) return;
  }
  const button = $('#export-html');
  if (button) button.disabled = true;
  try {
    const htmlOptions = {
      filename: tab.name,
      previewStyle: workspaceState.settings.previewStyle || 'file',
      runJavaScript: supportsMarkupPreview(tab.name) && tab.runJavaScript === true,
      fallbackCSS: getFallbackPreviewCSS((workspaceState.settings.previewStyle || 'file') === 'aether'),
      baseURL: document.baseURI,
    };
    const exported = await buildStandaloneHTML(tab.text, htmlOptions);
    downloadText(exported.html, safeHTMLFilename(tab.name), 'text/html;charset=utf-8');
    if (exported.unresolvedStylesheets.length) {
      showToast(`HTML exported, but ${exported.unresolvedStylesheets.length} stylesheet(s) could not be embedded; they remain linked.`, true);
    } else {
      showToast('Rendered HTML exported. Linked CSS was embedded where accessible.');
    }
  } catch (error) {
    console.error('AetherText HTML export failed:', error);
    showToast('Could not export the rendered HTML.', true);
  } finally {
    if (button) button.disabled = false;
  }
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}`;
  const mark = document.createElement('span');
  mark.className = 'toast-mark';
  mark.textContent = isError ? '!' : '✦';
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(mark, text);
  toastRegion.append(toast);
  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 180);
  }, 3200);
}

function openModal(backdrop, focusTarget) {
  modalFocusReturn = document.activeElement;
  backdrop.hidden = false;
  document.body.classList.add('modal-open');
  window.setTimeout(() => focusTarget?.focus(), 0);
}
function closeModal(backdrop) {
  backdrop.hidden = true;
  if ([paletteBackdrop, settingsBackdrop, findBackdrop, snippetsBackdrop, historyBackdrop].every((item) => !item || item.hidden)) document.body.classList.remove('modal-open');
  if (modalFocusReturn instanceof HTMLElement) modalFocusReturn.focus({ preventScroll: true });
}
function openPalette() {
  closeReferencePanel();
  openModal(paletteBackdrop, paletteSearch);
  paletteSearch.value = '';
  renderCommands();
}
function closePalette() { closeModal(paletteBackdrop); }
function openSettings() {
  themeSelect.value = workspaceState.settings.theme;
  previewStyleSelect.value = workspaceState.settings.previewStyle || 'file';
  $('#autocomplete-enabled').checked = workspaceState.settings.autocomplete !== false;
  $('#auto-close-enabled').checked = workspaceState.settings.autoCloseTags !== false;
  openModal(settingsBackdrop, themeSelect);
}
function closeSettings() { closeModal(settingsBackdrop); }

function buildCommands(query = '') {
  const commands = [
    { id: 'find-replace', title: 'Find and replace', description: 'Search the current document, then replace one or all matches', icon: '⌕', shortcut: 'Ctrl F', keywords: 'find search replace regex', run: openFind },
    { id: 'autocomplete-toggle', title: `${workspaceState.settings.autocomplete === false ? 'Enable' : 'Disable'} HTML tag autocomplete`, description: 'Toggle inline HTML tag suggestions while typing', icon: '<>', keywords: 'autocomplete suggestions html tags completion', run: () => { workspaceState.settings.autocomplete = workspaceState.settings.autocomplete === false; $('#autocomplete-enabled').checked = workspaceState.settings.autocomplete; updateAutocomplete(); notifyChange(); showToast(`HTML tag autocomplete ${workspaceState.settings.autocomplete ? 'enabled' : 'disabled'}.`); } },
    { id: 'autoclose-toggle', title: `${workspaceState.settings.autoCloseTags === false ? 'Enable' : 'Disable'} auto-closing tags`, description: 'Toggle automatic end tags and paired punctuation', icon: '</>', keywords: 'auto close tag pair brackets quotes', run: () => { workspaceState.settings.autoCloseTags = workspaceState.settings.autoCloseTags === false; $('#auto-close-enabled').checked = workspaceState.settings.autoCloseTags; notifyChange(); showToast(`Auto-close ${workspaceState.settings.autoCloseTags ? 'enabled' : 'disabled'}.`); } },
    { id: 'snippets', title: 'Open snippet library', description: 'Insert reusable Markdown, HTML, and CSS blocks', icon: '{ }', keywords: 'snippet template component boilerplate', run: openSnippets },
    { id: 'history', title: 'Document history', description: 'Create a checkpoint or restore an earlier draft', icon: '↶', keywords: 'history revisions versions recovery restore', run: openHistory },
    { id: 'checkpoint', title: 'Create history checkpoint', description: 'Save a named recovery point for this draft', icon: '◷', keywords: 'snapshot backup checkpoint restore', run: () => { void createHistoryCheckpoint(); } },
    { id: 'export-html', title: 'Export rendered HTML', description: 'Download the active preview as an HTML document', icon: '</>', keywords: 'export html webpage standalone css', run: () => { void exportActiveHTML(); } },
    ...VIEWPORTS.map((viewport) => ({ id: `viewport:${viewport.id}`, title: `Preview viewport: ${viewport.label}`, description: `Set preview width to ${viewport.width}`, icon: '▣', keywords: `viewport responsive width mobile tablet desktop ${viewport.label.toLowerCase()}`, run: () => applyViewport(viewport.id) })),
    { id: 'new-file', title: 'New file', description: 'Create a Markdown, text, HTML, CSS, or source file', icon: '+', shortcut: 'Ctrl N', keywords: 'create document tab markdown txt html css js json', run: openNewFileDialog },
    { id: 'open-files', title: 'Open local files', description: 'Import text files into workspace tabs', icon: '↥', shortcut: 'Ctrl O', keywords: 'open import local file html markdown css json text', run: openLocalFiles },
    { id: 'export', title: 'Export source file', description: 'Download the current source with its original file extension', icon: '↧', shortcut: 'Ctrl S', keywords: 'save download source txt html css js json markdown', run: exportActiveFile },
    { id: 'settings', title: 'Open settings', description: 'Choose a theme, font, or clear the saved session', icon: '⚙', keywords: 'preferences appearance fonts', run: openSettings },
    { id: 'reference', title: 'Toggle reference desk', description: 'Open a sandboxed web reference alongside your draft', icon: '↗', shortcut: 'Ctrl ⇧ R', keywords: 'browser website research url', run: toggleReferencePanel },
    { id: 'rename', title: 'Rename active file', description: 'Give the current tab a more useful name', icon: '✎', keywords: 'filename rename tab', run: renameActiveFile },
    { id: 'copy', title: 'Copy source text', description: 'Copy the current source text', icon: '▢', keywords: 'clipboard copy source', run: copyMarkdown },
    { id: 'theme-cycle', title: 'Switch to next theme', description: 'Cycle through the ten workspace themes', icon: '◐', keywords: 'appearance theme next', run: cycleTheme },
    { id: 'appearance-dark', title: 'Appearance: Dark mode', description: 'Use a dark palette with the current theme', icon: '☾', keywords: 'dark appearance night theme', run: () => applyAppearance('dark') },
    { id: 'appearance-light', title: 'Appearance: Light mode', description: 'Use a light palette with the current theme', icon: '☀', keywords: 'light appearance day theme', run: () => applyAppearance('light') },
    { id: 'appearance-system', title: 'Appearance: Follow system', description: 'Match your operating system appearance', icon: '◐', keywords: 'system automatic appearance theme', run: () => applyAppearance('system') },
    { id: 'preview-js-toggle', title: `${currentTab().runJavaScript ? 'Disable' : 'Enable'} JavaScript for current document`, description: 'Run scripts only in this document’s isolated preview; disabled by default', icon: 'JS', keywords: 'javascript scripts sandbox preview run document', run: () => { if (supportsMarkupPreview(currentTab().name)) toggleDocumentJavaScript(); else showToast('JavaScript preview is only available for Markdown and HTML documents.', true); } },
    { id: 'preview-style-file', title: 'Preview style: File CSS', description: 'Preserve embedded, linked, and inline document styles', icon: '◫', keywords: 'preview css original source file styling', run: () => applyPreviewStyle('file') },
    { id: 'preview-style-aether', title: 'Preview style: Aether Theme', description: 'Suppress document CSS and adapt the content to your workspace theme', icon: '✦', keywords: 'preview adaptive theme clean restyle document css', run: () => applyPreviewStyle('aether') },
  ];
  for (const theme of THEMES) commands.push({
    id: `theme:${theme.id}`, title: `Theme: ${theme.label}`, description: theme.description, icon: theme.icon,
    keywords: `theme appearance ${theme.label.toLowerCase()}`, run: () => applyTheme(theme.id),
  });
  const cleanQuery = query.trim().toLowerCase();
  const fontTerm = cleanQuery.replace(/^(?:use\s+)?font\s*:?\s*/, '').trim();
  const wantsFontResults = cleanQuery.startsWith('font') || cleanQuery.startsWith('use font') || cleanQuery.length >= 3;
  const installedMatches = wantsFontResults
    ? discoveredFonts.filter((font) => !fontTerm || font.label.toLowerCase().includes(fontTerm)).slice(0, 50)
    : [];
  const fonts = [...CURATED_FONTS, ...installedMatches];
  for (const font of fonts) commands.push({
    id: `font:${font.id}`, title: `Use font: ${font.label}`, description: `Set the editor and interface in ${font.label}`, icon: 'Aa',
    keywords: `font typography ${font.label.toLowerCase()}`, run: () => applyFont(font),
  });
  return commands;
}

function renderCommands() {
  const query = paletteSearch.value.trim().toLowerCase();
  commandCache = buildCommands(query).filter((command) => `${command.title} ${command.description} ${command.keywords}`.toLowerCase().includes(query));
  activeCommandIndex = Math.min(activeCommandIndex, Math.max(0, commandCache.length - 1));
  paletteResults.replaceChildren();
  if (!commandCache.length) {
    const empty = document.createElement('div');
    empty.className = 'no-commands';
    empty.textContent = 'No matching commands. Try a theme, font, or action.';
    paletteResults.append(empty);
    return;
  }
  commandCache.forEach((command, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-option';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(index === activeCommandIndex));
    button.addEventListener('click', () => executeCommand(index));
    const icon = document.createElement('span');
    icon.className = 'command-option-icon';
    icon.textContent = command.icon;
    const copy = document.createElement('span');
    copy.className = 'command-option-copy';
    const title = document.createElement('span');
    title.className = 'command-option-title';
    title.textContent = command.title;
    const desc = document.createElement('span');
    desc.className = 'command-option-description';
    desc.textContent = command.description;
    copy.append(title, desc);
    button.append(icon, copy);
    if (command.shortcut) {
      const key = document.createElement('kbd');
      key.textContent = command.shortcut;
      button.append(key);
    }
    paletteResults.append(button);
  });
  const selected = $('.command-option[aria-selected="true"]', paletteResults);
  selected?.scrollIntoView({ block: 'nearest' });
}

function executeCommand(index) {
  const command = commandCache[index];
  if (!command) return;
  closePalette();
  command.run();
}

function cycleTheme() {
  const currentIndex = THEMES.findIndex((theme) => theme.id === workspaceState.settings.theme);
  applyTheme(THEMES[(currentIndex + 1) % THEMES.length].id);
}

function renameActiveFile() {
  const tab = currentTab();
  const requested = window.prompt(tab.assetBlob instanceof Blob ? 'Rename this asset (its extension is preserved):' : 'Rename this text file (keep or change its extension):', tab.name);
  if (requested === null) return;
  let name = cleanFilename(requested, getFileType(tab.name).extension || '.md');
  if (tab.assetBlob instanceof Blob) {
    const currentExtension = getFileType(tab.name).extension || '';
    const requestedExtension = getFileType(name).extension;
    if (requestedExtension !== currentExtension) {
      const stem = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
      name = `${stem || 'Asset'}${currentExtension}`;
    }
  }
  if (!name) { showToast('A file name cannot be empty.', true); return; }
  tab.name = name;
  tab.dirty = true;
  renderTabs();
  updateFileModeUI();
  updatePreviewAddress(name);
  renderPreview(false);
  notifyChange();
}

function populateFontsSelect(localFonts = discoveredFonts, filter = $('#local-font-filter')?.value || '') {
  const selectedId = workspaceState.settings.font.id;
  fontSelect.replaceChildren();
  const curatedGroups = new Map();
  for (const font of CURATED_FONTS) {
    const groupName = font.group || 'Common fonts';
    if (!curatedGroups.has(groupName)) {
      const group = document.createElement('optgroup');
      group.label = groupName;
      curatedGroups.set(groupName, group);
      fontSelect.append(group);
    }
    const option = document.createElement('option');
    option.value = font.id;
    option.textContent = font.label;
    curatedGroups.get(groupName).append(option);
  }
  if (localFonts.length) {
    const term = filter.trim().toLowerCase();
    const matches = term ? localFonts.filter((font) => font.label.toLowerCase().includes(term)) : localFonts;
    const visibleFonts = matches.slice(0, 300);
    const group = document.createElement('optgroup');
    group.label = matches.length > visibleFonts.length
      ? `Installed fonts (showing ${visibleFonts.length} of ${matches.length}; refine search)`
      : `Installed on this device (${matches.length})`;
    visibleFonts.forEach((font) => {
      const option = document.createElement('option');
      option.value = font.id;
      option.textContent = font.label;
      group.append(option);
    });
    fontSelect.append(group);
  }
  const chosenExists = [...fontSelect.options].some((option) => option.value === selectedId);
  if (!chosenExists && selectedId) {
    const option = document.createElement('option');
    option.value = selectedId;
    option.textContent = `${workspaceState.settings.font.family} (current selection)`;
    option.dataset.dynamic = 'true';
    fontSelect.append(option);
  }
  fontSelect.value = selectedId;
}

function fontIdForFamily(family) {
  let hash = 2166136261;
  for (const character of family) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `local-font-${(hash >>> 0).toString(36)}`;
}

async function discoverLocalFonts() {
  const status = $('#font-api-status');
  if (typeof window.queryLocalFonts !== 'function') {
    status.textContent = 'Local Font Access is unavailable here. The 20 curated choices still work; you can also use the system font list.';
    showToast('This browser does not support Local Font Access. The fallback font list is ready.');
    return;
  }
  const button = $('#discover-fonts');
  button.disabled = true;
  button.textContent = 'Loading…';
  status.textContent = 'Requesting permission. This only runs when you click the button; font weights are grouped by family.';
  try {
    const installed = await window.queryLocalFonts();
    // queryLocalFonts returns faces/weights; keep one entry per family rather than
    // flooding the picker with Bold, Italic, Light, Variable, and other faces.
    const byFamily = new Map();
    for (const font of installed) {
      const family = typeof font.family === 'string' ? font.family.trim() : '';
      const familyKey = family.toLocaleLowerCase();
      if (family && !byFamily.has(familyKey)) byFamily.set(familyKey, family);
    }
    const families = [...byFamily.values()].sort((a, b) => a.localeCompare(b));
    discoveredFonts = families.map((family) => ({
      id: fontIdForFamily(family), label: family, family, fallback: 'sans-serif',
    }));
    $('#font-filter-row').hidden = discoveredFonts.length === 0;
    $('#local-font-filter').value = '';
    populateFontsSelect(discoveredFonts, '');
    if (discoveredFonts.length > 300) {
      status.textContent = `${discoveredFonts.length.toLocaleString()} families found (weights grouped together). Showing 300 at a time; type a name to filter.`;
    } else {
      status.textContent = `${discoveredFonts.length.toLocaleString()} installed families loaded on request (weights grouped together).`;
    }
    if (!discoveredFonts.length) status.textContent = 'No installed fonts were returned. The fallback list remains available.';
    renderCommands();
    showToast(`Found ${discoveredFonts.length.toLocaleString()} installed font families`);
  } catch (error) {
    const blocked = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
    status.textContent = blocked ? 'Font access was not granted. You can enable it in browser permissions.' : 'Could not read local fonts. The curated list still works.';
    showToast(blocked ? 'Local font access was not granted.' : 'Could not load installed fonts.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Load installed fonts';
  }
}

async function clearSavedSession() {
  if (!window.confirm('Clear the saved workspace and start fresh? This permanently removes the stored tabs and drafts from this browser.')) return;
  window.clearTimeout(saveTimer);
  saveAgain = false;
  try {
    await clearWorkspace();
    workspaceState = defaultWorkspace();
    stateRevision++;
    closeSettings();
    applySavedSettings();
    renderTabs();
    renderActiveTab(true);
    closeReferencePanel();
    referenceUrl.value = '';
    referenceFrame.src = 'about:blank';
    referenceEmpty.classList.remove('is-hidden');
    referenceLoaded = false;
    setSaveStatus('saved', 'Fresh local workspace');
    showToast('Saved session cleared. You’re starting fresh.');
  } catch (error) {
    console.error('AetherText session clear failed:', error);
    showToast('Could not clear the local session.', true);
  }
}

function setupEvents() {
  window.addEventListener('resize', positionAutocompletePopup, { passive: true });
  const appearanceMedia = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (appearanceMedia && !setupEvents.appearanceListenerAdded) {
    const onSystemAppearanceChange = () => {
      if (workspaceState?.settings?.appearance === 'system') applyAppearance('system', false);
    };
    if (appearanceMedia.addEventListener) appearanceMedia.addEventListener('change', onSystemAppearanceChange);
    else appearanceMedia.addListener?.(onSystemAppearanceChange);
    setupEvents.appearanceListenerAdded = true;
  }
  editor.addEventListener('input', onEditorInput);
  editor.addEventListener('keydown', handleEditorKeydown);
  editor.addEventListener('scroll', syncScrollFromEditor, { passive: true });
  editor.addEventListener('keyup', () => {
    currentTab().cursorStart = editor.selectionStart;
    currentTab().cursorEnd = editor.selectionEnd;
    updateLineIndicator();
    updateMirror();
    updateAutocomplete();
    scheduleSave();
  });
  editor.addEventListener('click', () => {
    currentTab().cursorStart = editor.selectionStart;
    currentTab().cursorEnd = editor.selectionEnd;
    updateLineIndicator();
    updateMirror();
    updateAutocomplete();
    scheduleSave();
  });
  editor.addEventListener('select', () => {
    currentTab().cursorStart = editor.selectionStart;
    currentTab().cursorEnd = editor.selectionEnd;
    updateLineIndicator();
    updateMirror();
    updateAutocomplete();
  });
  editor.addEventListener('blur', () => { hideAutocomplete(); captureActiveView(); scheduleSave(); });
  window.addEventListener('message', handleBrowserPreviewMessage);
  browserPreviewFrame.addEventListener('load', handleBrowserPreviewLoad);
  $('#reload-browser-preview').addEventListener('click', () => renderPreview(false));
  $('#toggle-preview-js').addEventListener('click', toggleDocumentJavaScript);
  viewportSelect.addEventListener('change', () => applyViewport(viewportSelect.value));
  $('#export-html').addEventListener('click', () => { void exportActiveHTML(); });
  $('#open-find').addEventListener('click', openFind);
  $('#open-snippets').addEventListener('click', openSnippets);
  $('#open-history').addEventListener('click', openHistory);
  $('#find-next').addEventListener('click', findNextMatch);
  $('#replace-one').addEventListener('click', replaceOneMatch);
  $('#replace-all').addEventListener('click', replaceAllMatches);
  ['find-input', 'find-case-sensitive', 'find-whole-word', 'find-regex'].forEach((id) => $(`#${id}`).addEventListener('input', refreshFindMatches));
  $('#close-find').addEventListener('click', closeFind);
  $('#snippet-category').addEventListener('change', () => { currentSnippetCategory = $('#snippet-category').value; renderSnippetList(); });
  $('#snippet-search').addEventListener('input', renderSnippetList);
  $('#close-snippets').addEventListener('click', closeSnippets);
  $('#close-snippets-footer').addEventListener('click', closeSnippets);
  $('#close-history').addEventListener('click', closeHistory);
  $('#close-history-footer').addEventListener('click', closeHistory);
  $('#create-checkpoint').addEventListener('click', () => { void createHistoryCheckpoint(); });
  $('#toggle-preview-style').addEventListener('click', () => applyPreviewStyle(workspaceState.settings.previewStyle === 'aether' ? 'file' : 'aether'));

  $('#new-tab').addEventListener('click', openNewFileDialog);
  $('#open-files').addEventListener('click', openLocalFiles);
  importFilesInput.addEventListener('change', () => { void importSelectedFiles(); });
  $('#new-file-form').addEventListener('submit', (event) => { event.preventDefault(); createNewFile(); });
  $('#cancel-new-file').addEventListener('click', closeNewFileDialog);
  $('#close-new-file').addEventListener('click', closeNewFileDialog);
  newFileType.addEventListener('change', () => {
    const before = newFileName.value.trim();
    if (newFileType.value === 'other' && /^Untitled(?:-\d+)?\.md$/i.test(before)) newFileName.value = before.replace(/\.md$/i, '.txt');
    else newFileName.value = filenameForType(before, newFileType.value);
  });
  $('#export-file').addEventListener('click', exportActiveFile);
  $('#open-palette').addEventListener('click', openPalette);
  $('#open-settings').addEventListener('click', openSettings);
  $('#toggle-reference').addEventListener('click', toggleReferencePanel);
  $('#toggle-mobile-preview').addEventListener('click', toggleMobilePreview);
  $('#close-reference').addEventListener('click', closeReferencePanel);
  $('#insert-heading').addEventListener('click', insertHeading);
  $('#insert-bold').addEventListener('click', insertBold);
  $('#insert-link').addEventListener('click', insertLink);
  $('#focus-editor').addEventListener('click', () => editor.focus());
  $('#copy-markdown').addEventListener('click', () => { void copyMarkdown(); });

  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  appearanceSelect.addEventListener('change', () => applyAppearance(appearanceSelect.value));
  previewStyleSelect.addEventListener('change', () => applyPreviewStyle(previewStyleSelect.value));
  fontSelect.addEventListener('change', () => {
    const chosen = [...CURATED_FONTS, ...discoveredFonts].find((font) => font.id === fontSelect.value);
    if (chosen) applyFont(chosen);
    else {
      const option = fontSelect.selectedOptions[0];
      if (option) applyFont({ id: option.value, label: option.textContent.replace(/ \(restored\)$/, ''), family: workspaceState.settings.font.family, fallback: 'sans-serif' });
    }
  });
  $('#accent-color').addEventListener('input', (event) => applyAccentColor(event.target.value));
  $$('.accent-swatch').forEach((button) => button.addEventListener('click', () => applyAccentColor(button.dataset.accentColor)));
  $('#reset-accent').addEventListener('click', () => applyAccentColor(''));
  $('#editor-font-size').addEventListener('input', (event) => {
    workspaceState.settings.editorFontSize = Number(event.target.value);
    applyEditorPreferences(true);
  });
  $('#editor-line-height').addEventListener('change', (event) => {
    workspaceState.settings.editorLineHeight = event.target.value;
    applyEditorPreferences(true);
  });
  $('#editor-tab-size').addEventListener('change', (event) => {
    workspaceState.settings.editorTabSize = Number(event.target.value);
    applyEditorPreferences(true);
  });
  $('#editor-word-wrap').addEventListener('change', (event) => {
    workspaceState.settings.editorWordWrap = event.target.checked;
    applyEditorPreferences(true);
  });
  $('#reduce-motion').addEventListener('change', (event) => {
    workspaceState.settings.reduceMotion = event.target.checked;
    applyEditorPreferences(true);
  });
  $('#autocomplete-enabled').addEventListener('change', (event) => {
    workspaceState.settings.autocomplete = event.target.checked;
    if (!event.target.checked) hideAutocomplete(); else { dismissedAutocompleteKey = ''; updateAutocomplete(); }
    notifyChange();
  });
  $('#auto-close-enabled').addEventListener('change', (event) => {
    workspaceState.settings.autoCloseTags = event.target.checked;
    notifyChange();
  });
  $('#discover-fonts').addEventListener('click', () => { void discoverLocalFonts(); });
  $('#local-font-filter').addEventListener('input', () => {
    populateFontsSelect(discoveredFonts, $('#local-font-filter').value);
    const term = $('#local-font-filter').value.trim().toLowerCase();
    const matches = term ? discoveredFonts.filter((font) => font.label.toLowerCase().includes(term)).length : discoveredFonts.length;
    $('#font-api-status').textContent = term
      ? `${matches.toLocaleString()} matching font families; at most 300 are shown at once.`
      : `${discoveredFonts.length.toLocaleString()} font families found; type a name to narrow the list.`;
  });
  $('#clear-session').addEventListener('click', () => { void clearSavedSession(); });
  $('#close-settings').addEventListener('click', closeSettings);
  $('#done-settings').addEventListener('click', closeSettings);
  $('#reference-form').addEventListener('submit', (event) => {
    event.preventDefault();
    loadReference(referenceUrl.value);
  });
  $$('.reference-shortcuts [data-url]').forEach((button) => button.addEventListener('click', () => loadReference(button.dataset.url)));

  paletteSearch.addEventListener('input', () => { activeCommandIndex = 0; renderCommands(); });
  paletteSearch.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); activeCommandIndex = Math.min(commandCache.length - 1, activeCommandIndex + 1); renderCommands(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activeCommandIndex = Math.max(0, activeCommandIndex - 1); renderCommands(); }
    else if (event.key === 'Enter') { event.preventDefault(); executeCommand(activeCommandIndex); }
    else if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
  });

  for (const backdrop of [paletteBackdrop, settingsBackdrop, findBackdrop, snippetsBackdrop, historyBackdrop, newFileBackdrop]) {
    backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) closeModal(backdrop); });
  }

  document.addEventListener('keydown', (event) => {
    const primary = event.ctrlKey || event.metaKey;
    if (primary && event.key.toLowerCase() === 'f') { event.preventDefault(); openFind(); return; }
    if (primary && event.key.toLowerCase() === 'h') { event.preventDefault(); openFind(true); return; }
    if (primary && event.key.toLowerCase() === 'k') { event.preventDefault(); if (paletteBackdrop.hidden) openPalette(); else closePalette(); return; }
    if (primary && event.key.toLowerCase() === 'n') { event.preventDefault(); openNewFileDialog(); return; }
    if (primary && event.key.toLowerCase() === 'o') { event.preventDefault(); openLocalFiles(); return; }
    if (primary && event.key.toLowerCase() === 's') { event.preventDefault(); exportActiveFile(); return; }
    if (primary && event.shiftKey && event.key.toLowerCase() === 'r') { event.preventDefault(); toggleReferencePanel(); return; }
    if (event.key === 'Escape') {
      if (!paletteBackdrop.hidden) closePalette();
      else if (!settingsBackdrop.hidden) closeSettings();
      else if (!findBackdrop.hidden) closeFind();
      else if (!snippetsBackdrop.hidden) closeSnippets();
      else if (!historyBackdrop.hidden) closeHistory();
      else if (!newFileBackdrop.hidden) closeNewFileDialog();
      else if (body.classList.contains('reference-open')) closeReferencePanel();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      captureActiveView();
      void saveNow();
    }
  });
  window.addEventListener('pagehide', () => {
    captureActiveView();
    void saveNow();
  });
  window.addEventListener('beforeunload', () => {
    captureActiveView();
    if (!saveInFlight) void saveNow();
  });
}

async function init() {
  setSaveStatus('saving', 'Restoring local session…');
  try {
    const saved = await readWorkspace();
    workspaceState = normaliseWorkspace(saved);
    if (saved) setSaveStatus('saved', 'Session restored');
    else setSaveStatus('saved', 'Local workspace');
  } catch (error) {
    console.error('AetherText could not read IndexedDB:', error);
    workspaceState = defaultWorkspace();
    setSaveStatus('error', 'Storage unavailable');
    showToast('Browser storage could not be opened. Your current tab still works, but recovery may be unavailable.', true);
  }

  applySavedSettings();
  setupEvents();
  renderTabs();
  renderActiveTab(true);

  if (workspaceState.referenceUrl) {
    referenceUrl.value = workspaceState.referenceUrl;
    loadReference(workspaceState.referenceUrl);
    closeReferencePanel();
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      // Installation is intentionally quiet; offline support is part of the app shell.
    }).catch((error) => console.warn('AetherText service worker registration failed:', error));
  }
}

void init();
