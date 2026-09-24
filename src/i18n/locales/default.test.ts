import {
  describe,
  expect,
  it
} from 'vitest';

import { defaultTranslations } from './default.ts';

describe('defaultTranslations', () => {
  it('should merge the obsidian-dev-utils translations', () => {
    expect(defaultTranslations.obsidianDevUtils.buttons.cancel).toBeTypeOf('string');
  });

  it('should expose the report section titles', () => {
    expect(defaultTranslations.misplacedAttachment.report.title).toBe('Misplaced attachments');
    expect(defaultTranslations.pathCompatibility.report.title).toBe('Path compatibility');
  });
});
