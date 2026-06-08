import {
  describe,
  expect,
  it
} from 'vitest';

import {
  CollectAttachmentUsedByMultipleNotesMode,
  MoveAttachmentToProperFolderUsedByMultipleNotesMode,
  PluginSettings
} from './plugin-settings.ts';

describe('PluginSettings', () => {
  describe('defaults', () => {
    it('should have the expected default values', () => {
      const settings = new PluginSettings();
      expect(settings.collectAttachmentUsedByMultipleNotesMode).toBe(CollectAttachmentUsedByMultipleNotesMode.Skip);
      expect(settings.moveAttachmentToProperFolderUsedByMultipleNotesMode).toBe(MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll);
      expect(settings.consistencyReportFile).toBe('consistency-report.md');
      expect(settings.shouldChangeNoteBacklinksDisplayText).toBe(true);
      expect(settings.shouldShowBackupWarning).toBe(true);
      expect(settings.shouldUpdateLinks).toBe(true);
      expect(settings.treatAsAttachmentExtensions).toStrictEqual(['.excalidraw.md']);
      expect(settings.hadDangerousSettingsReverted).toBe(false);
    });
  });

  describe('excludePaths', () => {
    it('should get and set the exclude paths', () => {
      const settings = new PluginSettings();
      expect(settings.excludePaths).toStrictEqual([]);
      settings.excludePaths = ['a', 'b'];
      expect(settings.excludePaths).toStrictEqual(['a', 'b']);
    });
  });

  describe('includePaths', () => {
    it('should get and set the include paths', () => {
      const settings = new PluginSettings();
      expect(settings.includePaths).toStrictEqual([]);
      settings.includePaths = ['x'];
      expect(settings.includePaths).toStrictEqual(['x']);
    });
  });

  describe('excludePathsFromAttachmentCollecting', () => {
    it('should get and set the exclude paths from attachment collecting', () => {
      const settings = new PluginSettings();
      expect(settings.excludePathsFromAttachmentCollecting).toStrictEqual([]);
      settings.excludePathsFromAttachmentCollecting = ['attachments'];
      expect(settings.excludePathsFromAttachmentCollecting).toStrictEqual(['attachments']);
    });
  });

  describe('isPathIgnored', () => {
    it('should ignore paths matching the exclude paths', () => {
      const settings = new PluginSettings();
      settings.excludePaths = ['ignored'];
      expect(settings.isPathIgnored('ignored/note.md')).toBe(true);
      expect(settings.isPathIgnored('kept/note.md')).toBe(false);
    });
  });

  describe('isExcludedFromAttachmentCollecting', () => {
    it('should exclude paths matching the attachment-collecting exclude paths', () => {
      const settings = new PluginSettings();
      settings.excludePathsFromAttachmentCollecting = ['skip'];
      expect(settings.isExcludedFromAttachmentCollecting('skip/file.png')).toBe(true);
      expect(settings.isExcludedFromAttachmentCollecting('other/file.png')).toBe(false);
    });
  });

  describe('revertDangerousSettings', () => {
    it('should do nothing when the backup warning is disabled', () => {
      const settings = new PluginSettings();
      settings.shouldShowBackupWarning = false;
      settings.shouldDeleteAttachmentsWithNote = true;
      settings.revertDangerousSettings();
      expect(settings.shouldDeleteAttachmentsWithNote).toBe(true);
      expect(settings.hadDangerousSettingsReverted).toBe(false);
    });

    it('should revert dangerous settings and record that they were reverted', () => {
      const settings = new PluginSettings();
      settings.shouldDeleteAttachmentsWithNote = true;
      settings.shouldDeleteExistingFilesWhenMovingNote = true;
      settings.shouldMoveAttachmentsWithNote = true;
      settings.shouldCollectAttachmentsAutomatically = true;
      settings.revertDangerousSettings();
      expect(settings.shouldDeleteAttachmentsWithNote).toBe(false);
      expect(settings.shouldDeleteExistingFilesWhenMovingNote).toBe(false);
      expect(settings.shouldMoveAttachmentsWithNote).toBe(false);
      expect(settings.shouldCollectAttachmentsAutomatically).toBe(false);
      expect(settings.hadDangerousSettingsReverted).toBe(true);
    });

    it('should record no revert when no dangerous setting was enabled', () => {
      const settings = new PluginSettings();
      settings.revertDangerousSettings();
      expect(settings.hadDangerousSettingsReverted).toBe(false);
    });
  });
});
