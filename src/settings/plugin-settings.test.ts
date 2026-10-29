import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PATH_COMPATIBILITY_PLATFORMS,
  PathCompatibilityPlatform
} from '../path-compatibility/path-compatibility.ts';
import {
  ExternalAttachmentLinkMode,
  PluginSettings
} from './plugin-settings.ts';

describe('PluginSettings', () => {
  describe('defaults', () => {
    it('should have the expected default values', () => {
      const settings = new PluginSettings();
      expect(settings.consistencyReportFile).toBe('consistency-report.md');
      expect(settings.shouldShowBackupWarning).toBe(true);
      expect(settings.treatAsAttachmentExtensions).toStrictEqual(['.excalidraw.md']);
      expect(settings.isCustomAttachmentLocationSuggestionDeclined).toBe(false);
      // A fresh install has nothing to hand to `Advanced Rename and Delete Handler`, so it is never offered a
      // migration.
      expect(settings.proposedRenameDeleteSettings).toBeNull();
      // Nor anything to hand to `Custom Attachment Location`.
      expect(settings.proposedCollectSettings).toBeNull();
      // A note linking an attachment outside its own folder is reported, even when another note owns it.
      expect(settings.externalAttachmentLinkMode).toBe(ExternalAttachmentLinkMode.Report);
      expect(settings.sharedAttachmentPaths).toStrictEqual([]);
    });
  });

  describe('isConsistencyReportPath', () => {
    it('should match the configured report and nothing else', () => {
      const settings = new PluginSettings();
      expect(settings.isConsistencyReportPath('consistency-report.md')).toBe(true);
      expect(settings.isConsistencyReportPath('notes/consistency-report.md')).toBe(false);
    });

    it('should normalize the configured path', () => {
      const settings = new PluginSettings();
      settings.consistencyReportFile = '/Reports//consistency.md';
      expect(settings.isConsistencyReportPath('Reports/consistency.md')).toBe(true);
    });
  });

  describe('isSharedAttachmentPath', () => {
    it('should match nothing while the list is empty', () => {
      const settings = new PluginSettings();
      expect(settings.isSharedAttachmentPath('Shared/image.png')).toBe(false);
      expect(settings.isSharedAttachmentPath('image.png')).toBe(false);
    });

    it('should match a plain folder, everything under it, and nothing that merely shares its prefix', () => {
      const settings = new PluginSettings();
      settings.sharedAttachmentPaths = ['Shared/'];
      expect(settings.isSharedAttachmentPath('Shared/image.png')).toBe(true);
      expect(settings.isSharedAttachmentPath('Shared/deep/image.png')).toBe(true);
      expect(settings.isSharedAttachmentPath('Shared stuff/image.png')).toBe(false);
      expect(settings.isSharedAttachmentPath('notes/Shared/image.png')).toBe(false);
    });

    it('should match a regular expression anywhere in the path', () => {
      const settings = new PluginSettings();
      settings.sharedAttachmentPaths = [String.raw`/_assets\/common\//`];
      expect(settings.isSharedAttachmentPath('projects/_assets/common/logo.png')).toBe(true);
      expect(settings.isSharedAttachmentPath('projects/_assets/logo.png')).toBe(false);
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

  describe('isPathIgnored', () => {
    it('should ignore paths matching the exclude paths', () => {
      const settings = new PluginSettings();
      settings.excludePaths = ['ignored'];
      expect(settings.isPathIgnored('ignored/note.md')).toBe(true);
      expect(settings.isPathIgnored('kept/note.md')).toBe(false);
    });

    it('should match case-insensitively', () => {
      const settings = new PluginSettings();
      settings.excludePaths = ['Ignored'];
      expect(settings.isPathIgnored('ignored/note.md')).toBe(true);
    });

    it('should match a folder-only glob against the folder itself only when told it is a folder', () => {
      const settings = new PluginSettings();
      settings.excludePaths = ['tmp*/'];
      expect(settings.isPathIgnored('a/tmp1/note.md')).toBe(true);
      expect(settings.isPathIgnored('a/tmp1', true)).toBe(true);
      expect(settings.isPathIgnored('a/tmp1')).toBe(false);
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

  it('should normalize Unicode names by default', () => {
    expect(new PluginSettings().shouldNormalizeUnicodeNames).toBe(true);
  });

  describe('getPathCompatibilityPlatforms', () => {
    // `Platform` reports Windows in the unit-test mocks, so that is the platform a fresh install enables.
    it('should enable the current platform only', () => {
      expect(new PluginSettings().getPathCompatibilityPlatforms()).toStrictEqual([PathCompatibilityPlatform.Windows]);
    });

    it('should enable nothing when every toggle is off', () => {
      const settings = new PluginSettings();
      settings.shouldEnsurePathCompatibilityOnWindows = false;
      expect(settings.getPathCompatibilityPlatforms()).toStrictEqual([]);
    });

    it('should enable each toggled platform, in report order', () => {
      const settings = new PluginSettings();
      settings.shouldEnsurePathCompatibilityOnAndroid = true;
      settings.shouldEnsurePathCompatibilityOnIos = true;
      expect(settings.getPathCompatibilityPlatforms()).toStrictEqual([
        PathCompatibilityPlatform.Windows,
        PathCompatibilityPlatform.Android,
        PathCompatibilityPlatform.Ios
      ]);
    });

    it('should enable every platform under the master toggle, whatever the individual ones say', () => {
      const settings = new PluginSettings();
      settings.shouldEnsurePathCompatibilityOnWindows = false;
      settings.shouldEnsurePathCompatibilityOnEveryPlatform = true;
      expect(settings.getPathCompatibilityPlatforms()).toStrictEqual([...PATH_COMPATIBILITY_PLATFORMS]);
    });

    it('should default the sidecar pattern to the full file name', () => {
      const settings = new PluginSettings();
      expect(settings.sidecarNoteNamePattern).toBe('{{fileName}}.md');
      expect(settings.maxVaultRootPathLength).toBe(0);
      expect(settings.shouldCreateNoteToPreserveOriginalName).toBe(false);
    });

    it('should default the repair to what earlier versions did', () => {
      const settings = new PluginSettings();
      expect(settings.forbiddenCharacterReplacement).toBe('-');
      expect(settings.shouldAddOriginalNameAsAlias).toBe(true);
    });
  });
});
