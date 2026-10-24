import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHTML } from '../html-export.js';

const fakeFetch = async (url) => ({
  ok: url.endsWith('/styles/vault.css'),
  status: url.endsWith('/styles/vault.css') ? 200 : 404,
  text: async () => '.card { background: url("../img/paper.png"); color: tomato; }',
});

test('standalone HTML embeds accessible linked stylesheets and rewrites CSS assets', async () => {
  const result = await buildStandaloneHTML('<link rel="stylesheet" href="/styles/vault.css">\n<div class="card">Content</div>', {
    baseURL: 'https://example.test/app/index.html', fetchImpl: fakeFetch,
  });
  assert.match(result.html, /\.card \{ background: url\("https:\/\/example\.test\/img\/paper\.png"\); color: tomato; \}/);
  assert.doesNotMatch(result.html, /href="\/styles\/vault\.css"/);
  assert.deepEqual(result.unresolvedStylesheets, []);
  assert.doesNotMatch(result.html, /aetherTextPreview/);
});

test('unavailable stylesheets remain linked and are reported instead of silently discarded', async () => {
  const result = await buildStandaloneHTML('<link rel="stylesheet" href="missing.css">\n<h1>Saved</h1>', {
    baseURL: 'https://example.test/app/', fetchImpl: fakeFetch,
  });
  assert.match(result.html, /href="https:\/\/example\.test\/app\/missing\.css"/);
  assert.deepEqual(result.unresolvedStylesheets, ['https://example.test/app/missing.css']);
});

test('standalone export resolves accessible absolute and relative CSS imports', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === 'https://example.test/styles/site.css') {
      return { ok: true, status: 200, text: async () => '@import url("https://example.test/styles/fonts.css") screen; .card { color: tomato; }' };
    }
    if (url === 'https://example.test/styles/fonts.css') {
      return { ok: true, status: 200, text: async () => '.fonted { font-family: "Demo"; }' };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  const result = await buildStandaloneHTML('<link rel="stylesheet" href="../styles/site.css"><div class="card">Content</div>', {
    baseURL: 'https://example.test/app/index.html', fetchImpl,
  });
  assert.ok(calls.includes('https://example.test/styles/fonts.css'));
  assert.match(result.html, /@media screen/);
  assert.match(result.html, /\.fonted \{ font-family: "Demo"; \}/);
  assert.deepEqual(result.unresolvedStylesheets, []);
});

test('adaptive HTML export excludes author CSS but embeds the selected fallback theme', async () => {
  const result = await buildStandaloneHTML('<style>h1{color:red}</style>\n# Adaptive title', {
    previewStyle: 'aether', fallbackCSS: 'body{background:#123;color:#eee}', baseURL: 'https://example.test/', fetchImpl: fakeFetch,
  });
  assert.match(result.html, /body\{background:#123;color:#eee\}/);
  assert.match(result.html, /<h1>Adaptive title<\/h1>/);
  assert.doesNotMatch(result.html, /h1\{color:red\}/);
});
