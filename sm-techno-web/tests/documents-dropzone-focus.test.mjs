import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('file drop zone shows the same yellow focus ring as the buttons', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some((selector) => selector.trim() === '.app-dropzone:focus-within'))
    .map(([, , body]) => body.replace(/\s+/g, ' '));
  assert.ok(
    rules.some((body) => /box-shadow:\s*0 0 0 3px rgba\(255,\s*196,\s*0,\s*0?\.35\)/.test(body)),
    'expected .app-dropzone:focus-within { box-shadow: 0 0 0 3px rgba(255, 196, 0, 0.35) }',
  );
});
