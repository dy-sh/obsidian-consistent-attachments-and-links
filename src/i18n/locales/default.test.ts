import {
  describe,
  expect,
  it
} from 'vitest';

import { defaultTranslations } from './default.ts';

describe('defaultTranslations', () => {
  it('should expose the modal headings', () => {
    expect(defaultTranslations.collectAttachmentUsedByMultipleNotesModal.heading).toBe('Collecting attachment used by multiple notes');
    expect(defaultTranslations.moveAttachmentToProperFolderUsedByMultipleNotesModal.heading).toBe('Collecting attachment used by multiple notes');
  });

  it('should expose the button labels', () => {
    expect(defaultTranslations.buttons.copy).toBe('Copy');
    expect(defaultTranslations.buttons.copyAll).toBe('Copy all');
    expect(defaultTranslations.buttons.move).toBe('Move');
    expect(defaultTranslations.buttons.select).toBe('Select');
    expect(defaultTranslations.buttons.skip).toBe('Skip');
  });

  it('should merge the obsidian-dev-utils translations', () => {
    expect(defaultTranslations.obsidianDevUtils.buttons.cancel).toBeTypeOf('string');
  });

  it('should expose the collect-attachment mode display texts', () => {
    expect(defaultTranslations.pluginSettings.collectAttachmentUsedByMultipleNotesMode.skip.displayText).toBe('Skip');
    expect(defaultTranslations.pluginSettings.collectAttachmentUsedByMultipleNotesMode.cancel.displayText).toBe('Cancel');
  });
});
