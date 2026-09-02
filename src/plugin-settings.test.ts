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
      expect(settings.shouldAddCommandsToFileMenu).toBe(true);
      expect(settings.shouldShowBackupWarning).toBe(true);
      expect(settings.treatAsAttachmentExtensions).toStrictEqual(['.excalidraw.md']);
      expect(settings.hadDangerousSettingsReverted).toBe(false);
      expect(settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined).toBe(false);
      // A fresh install has nothing to hand to Advanced Rename and Delete Handler, so it is never offered a
      // Migration.
      expect(settings.proposedRenameDeleteSettings).toBeNull();
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

  describe('attachmentUnitFolderPaths', () => {
    it('should get and set the attachment unit folder paths', () => {
      const settings = new PluginSettings();
      expect(settings.attachmentUnitFolderPaths).toStrictEqual([]);
      settings.attachmentUnitFolderPaths = ['assets/page_files'];
      expect(settings.attachmentUnitFolderPaths).toStrictEqual(['assets/page_files']);
    });
  });

  describe('isAttachmentUnitFolder', () => {
    it('should designate nothing while the setting is empty', () => {
      const settings = new PluginSettings();
      expect(settings.isAttachmentUnitFolder('assets/page_files')).toBe(false);
    });

    it('should match a plain entry from the vault root', () => {
      const settings = new PluginSettings();
      settings.attachmentUnitFolderPaths = ['assets/page_files'];
      expect(settings.isAttachmentUnitFolder('assets/page_files')).toBe(true);
      expect(settings.isAttachmentUnitFolder('elsewhere/assets/page_files')).toBe(false);
    });

    it('should match a folder name anywhere via a regular expression', () => {
      const settings = new PluginSettings();
      settings.attachmentUnitFolderPaths = [String.raw`/(^|\/)[^/]+_files(\/|$)/`];
      expect(settings.isAttachmentUnitFolder('assets/page_files')).toBe(true);
      expect(settings.isAttachmentUnitFolder('deeply/nested/other_files')).toBe(true);
      expect(settings.isAttachmentUnitFolder('assets/plain')).toBe(false);
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

  describe('isTreatedAsAttachment', () => {
    it('should treat files with a configured attachment extension as attachments', () => {
      const settings = new PluginSettings();
      expect(settings.isTreatedAsAttachment('drawing.excalidraw.md')).toBe(true);
      expect(settings.isTreatedAsAttachment('note.md')).toBe(false);
    });

    it('should match files inside folders', () => {
      const settings = new PluginSettings();
      expect(settings.isTreatedAsAttachment('folder/drawing.excalidraw.md')).toBe(true);
      expect(settings.isTreatedAsAttachment('folder/note.md')).toBe(false);
    });

    it('should match case-insensitively', () => {
      const settings = new PluginSettings();
      expect(settings.isTreatedAsAttachment('Drawing.ExCaLiDraw.MD')).toBe(true);
    });

    it('should normalize sloppily typed extensions', () => {
      const settings = new PluginSettings();
      settings.treatAsAttachmentExtensions = [' .Excalidraw.MD ', ''];
      expect(settings.isTreatedAsAttachment('drawing.excalidraw.md')).toBe(true);
      expect(settings.isTreatedAsAttachment('note.md')).toBe(false);
    });

    it('should not match an extension appearing mid-name', () => {
      const settings = new PluginSettings();
      expect(settings.isTreatedAsAttachment('drawing.excalidraw.md.backup')).toBe(false);
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
      settings.shouldCollectAttachmentsAutomatically = true;
      settings.revertDangerousSettings();
      expect(settings.shouldCollectAttachmentsAutomatically).toBe(true);
      expect(settings.hadDangerousSettingsReverted).toBe(false);
    });

    // The three rename/delete settings this used to revert moved to Advanced Rename and Delete Handler in
    // 4.0.0, which reverts its own. Auto-collecting is the one destructive setting still owned here.
    it('should revert dangerous settings and record that they were reverted', () => {
      const settings = new PluginSettings();
      settings.shouldCollectAttachmentsAutomatically = true;
      settings.revertDangerousSettings();
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
