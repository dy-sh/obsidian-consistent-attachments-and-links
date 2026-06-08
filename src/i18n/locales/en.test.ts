import {
  describe,
  expect,
  it
} from 'vitest';

import { defaultTranslations } from './default.ts';
import { en } from './en.ts';

describe('en', () => {
  it('should re-export the default translations', () => {
    expect(en).toBe(defaultTranslations);
  });
});
