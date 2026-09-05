import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/ontology/i18n.js', import.meta.url), 'utf8');

function loadLanguage({ query = '', savedLanguage, storageBlocked = false } = {}) {
  const location = new URL(`https://www.thesisforge.tech/ontology/${query}`);
  const backLink = {};
  const storage = new Map(savedLanguage ? [['guru-language', savedLanguage]] : []);
  const document = {
    readyState: 'complete',
    documentElement: {},
    querySelectorAll() { return []; },
    querySelector(selector) { return selector === '.guru-back-link' ? backLink : null; },
    createTreeWalker() { return { nextNode() { return null; } }; },
  };
  let replacedUrl = null;
  const context = {
    URL,
    URLSearchParams,
    document,
    location,
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
    MutationObserver: class { observe() {} },
    CustomEvent: class {},
    dispatchEvent() {},
    history: { replaceState(_state, _title, value) { replacedUrl = value; } },
    localStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error('Storage unavailable');
        return storage.get(key) || null;
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error('Storage unavailable');
        storage.set(key, value);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    api: context.OntologyI18n,
    backLink,
    document,
    storage,
    replacedUrl: () => replacedUrl,
  };
}

test('Ontology first visit defaults to English, including blocked storage', () => {
  for (const options of [{}, { storageBlocked: true }, { query: '?lang=unknown' }]) {
    const loaded = loadLanguage(options);
    assert.equal(loaded.api.language, 'en');
    assert.equal(loaded.document.documentElement.lang, 'en');
    assert.equal(loaded.backLink.href, '/?lang=en');
  }
});

test('Ontology respects saved Chinese and explicit query language takes precedence', () => {
  assert.equal(loadLanguage({ savedLanguage: 'zh' }).api.language, 'zh');
  assert.equal(loadLanguage({ query: '?lang=en', savedLanguage: 'zh' }).api.language, 'en');
  assert.equal(loadLanguage({ query: '?lang=zh', savedLanguage: 'en' }).api.language, 'zh');
  assert.equal(loadLanguage({ query: '?lang=zh-CN', storageBlocked: true }).api.language, 'zh');
});

test('switching Chinese writes an explicit route while preserving view and anchor', () => {
  const loaded = loadLanguage({ query: '?view=market&lang=en#latest' });
  loaded.api.setLanguage('zh');
  assert.equal(loaded.replacedUrl(), '/ontology/?view=market&lang=zh#latest');
  assert.equal(loaded.storage.get('guru-language'), 'zh');
  assert.equal(loaded.backLink.href, '/?lang=zh');
  assert.equal(loaded.document.documentElement.lang, 'zh-CN');
  const reloaded = loadLanguage({ query: '?view=market&lang=zh#latest' });
  assert.equal(reloaded.api.language, 'zh');
});

test('returning to the terminal retains the selection and explicitly chosen language', () => {
  const returnTo = '/?view=valuation&valuation=ISRG&lang=en&utm_source=x#research';
  const loaded = loadLanguage({ query: `?lang=zh&returnTo=${encodeURIComponent(returnTo)}` });
  assert.equal(loaded.backLink.href, '/?view=valuation&valuation=ISRG&lang=zh&utm_source=x#research');
  loaded.api.setLanguage('en');
  assert.equal(loaded.backLink.href, '/?view=valuation&valuation=ISRG&lang=en&utm_source=x#research');
});

test('untrusted return paths cannot move navigation off the terminal origin', () => {
  for (const returnTo of ['https://example.com/', '//example.com/', '/admin/']) {
    const loaded = loadLanguage({ query: `?lang=zh&returnTo=${encodeURIComponent(returnTo)}` });
    assert.equal(loaded.backLink.href, '/?lang=zh');
  }
});
