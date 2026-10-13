import { describe, expect, it } from 'vitest';

import { slugify } from '../slug';

describe('slugify', () => {
  it('lowercases and hyphenates basic input', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips diacritics', () => {
    expect(slugify('Café Déjà Vu')).toBe('cafe-deja-vu');
  });

  it('collapses runs of non-alphanumerics', () => {
    expect(slugify('  iPhone  ----  15 / Pro!! ')).toBe('iphone-15-pro');
  });

  it('drops non-Latin scripts (no transliteration) gracefully', () => {
    // Bengali text has no Latin equivalents, so we expect a clean empty
    // segment rather than a corrupted slug.
    expect(slugify('ঢাকা')).toBe('');
  });
});
