import {
  describe,
  expect,
  it
} from 'vitest';

import { en } from './en.ts';
import { translationsMap } from './translations-map.ts';

describe('translationsMap', () => {
  it('should map the en locale to the en translations', () => {
    expect(translationsMap.en).toBe(en);
  });

  it('should only contain the en locale', () => {
    expect(Object.keys(translationsMap)).toStrictEqual(['en']);
  });
});
