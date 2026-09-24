import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventMap } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { AsyncEvents } from 'obsidian-dev-utils/async-events';
import { noopAsync } from 'obsidian-dev-utils/function';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettings } from './plugin-settings.ts';

class MockDataHandler implements DataHandler {
  private data: unknown;

  public constructor(data: unknown = {}) {
    this.data = data;
  }

  public async loadData(): Promise<unknown> {
    await noopAsync();
    return this.data;
  }

  public async saveData(data: unknown): Promise<void> {
    // Obsidian writes `data.json` as JSON, so a reload reads a plain record rather than the saved object itself.
    this.data = JSON.parse(JSON.stringify(data) ?? 'null');
    await noopAsync();
  }
}

function createComponent(data: unknown = {}): PluginSettingsComponent {
  return new PluginSettingsComponent({
    dataHandler: new MockDataHandler(data),
    pluginEventSource: new AsyncEvents<PluginEventMap>()
  });
}

describe('PluginSettingsComponent', () => {
  describe('validators', () => {
    it('should accept valid regular expressions in includePaths and excludePaths', async () => {
      const component = createComponent();
      const settings = new PluginSettings();
      settings.includePaths = ['/valid.*/'];
      settings.excludePaths = ['plain/path'];
      const result = await component.validate(settings);
      expect(result.includePaths).toBeUndefined();
      expect(result.excludePaths).toBeUndefined();
    });

    it('should reject an invalid regular expression in includePaths', async () => {
      const component = createComponent();
      // The real PluginSettings setter eagerly compiles regexes and would throw, so a strict proxy
      // is used to feed the validator an invalid pattern directly.
      const settings = strictProxy<PluginSettings>({
        excludePaths: [],
        includePaths: ['/[/']
      });
      const result = await component.validate(settings);
      expect(result.includePaths).toBe('Invalid regular expression /[/');
    });

    it('should reject an invalid regular expression in excludePaths', async () => {
      const component = createComponent();
      const settings = strictProxy<PluginSettings>({
        excludePaths: ['/(/'],
        includePaths: []
      });
      const result = await component.validate(settings);
      expect(result.excludePaths).toBe('Invalid regular expression /(/');
    });

    it('should not treat plain path strings as regular expressions', async () => {
      const component = createComponent();
      const settings = new PluginSettings();
      settings.includePaths = ['folder/subfolder'];
      const result = await component.validate(settings);
      expect(result.includePaths).toBeUndefined();
    });
  });

  describe('legacy settings converter', () => {
    it('should convert ignoreFiles into regular-expression exclude paths', async () => {
      const component = createComponent({ ignoreFiles: ['secret'] });
      await component.loadWithPromises();
      expect(component.settings.excludePaths).toStrictEqual(['/secret$/']);
    });

    it('should convert ignoreFolders into exclude paths', async () => {
      const component = createComponent({ ignoreFolders: ['private'] });
      await component.loadWithPromises();
      expect(component.settings.excludePaths).toStrictEqual(['private']);
    });

    it('should map deleteEmptyFolders true to DeleteWithEmptyParents', async () => {
      const component = createComponent({ deleteEmptyFolders: true });
      await component.loadWithPromises();
      expect(component.settings.proposedRenameDeleteSettings?.emptyFolderBehavior).toBe(EmptyFolderBehavior.DeleteWithEmptyParents);
    });

    it('should map deleteEmptyFolders false to Keep', async () => {
      const component = createComponent({ deleteEmptyFolders: false });
      await component.loadWithPromises();
      expect(component.settings.proposedRenameDeleteSettings?.emptyFolderBehavior).toBe(EmptyFolderBehavior.Keep);
    });

    it('should prefer emptyAttachmentFolderBehavior over deleteEmptyFolders', async () => {
      const component = createComponent({
        deleteEmptyFolders: true,
        emptyAttachmentFolderBehavior: EmptyFolderBehavior.Delete
      });
      await component.loadWithPromises();
      expect(component.settings.proposedRenameDeleteSettings?.emptyFolderBehavior).toBe(EmptyFolderBehavior.Delete);
    });

    it('should map the remaining boolean legacy settings', async () => {
      const component = createComponent({
        autoCollectAttachments: true,
        changeNoteBacklinksAlt: true,
        deleteAttachmentsWithNote: true,
        deleteExistFilesWhenMoveNote: true,
        moveAttachmentsWithNote: true,
        showBackupWarning: false,
        updateLinks: false
      });
      await component.loadWithPromises();
      expect(component.settings.shouldCollectAttachmentsAutomatically).toBe(true);
      expect(component.settings.shouldShowBackupWarning).toBe(false);
      // The ancient names are mapped onto the 3.x ones first, and only then parked for the new owner — so a
      // vault that never saw 3.x still hands its values over intact.
      expect(component.settings.proposedRenameDeleteSettings).toStrictEqual({
        shouldDeleteConflictingAttachments: true,
        shouldHandleDeletions: true,
        shouldHandleRenames: false,
        shouldRenameAttachmentFolder: true,
        shouldUpdateFileNameAliases: true
      });
    });

    it('should park the 3.x rename and delete settings for the new owner', async () => {
      const component = createComponent({
        emptyFolderBehavior: EmptyFolderBehavior.Delete,
        excludePaths: ['private'],
        includePaths: ['notes'],
        shouldChangeNoteBacklinksDisplayText: false,
        shouldDeleteAttachmentsWithNote: true,
        shouldDeleteExistingFilesWhenMovingNote: true,
        shouldMoveAttachmentsWithNote: true,
        shouldUpdateLinks: false,
        treatAsAttachmentExtensions: ['.foo.md']
      });
      await component.loadWithPromises();
      expect(component.settings.proposedRenameDeleteSettings).toStrictEqual({
        emptyFolderBehavior: EmptyFolderBehavior.Delete,
        excludePaths: ['private'],
        includePaths: ['notes'],
        shouldDeleteConflictingAttachments: true,
        shouldHandleDeletions: true,
        shouldHandleRenames: false,
        shouldRenameAttachmentFolder: true,
        shouldUpdateFileNameAliases: false,
        treatAsAttachmentExtensions: ['.foo.md']
      });
    });

    // The path and treat-as-attachment settings are proposed, not handed over: many other features here still
    // read them.
    it('should keep the settings it proposes but does not own', async () => {
      const component = createComponent({
        excludePaths: ['private'],
        includePaths: ['notes'],
        treatAsAttachmentExtensions: ['.foo.md']
      });
      await component.loadWithPromises();
      expect(component.settings.excludePaths).toStrictEqual(['private']);
      expect(component.settings.includePaths).toStrictEqual(['notes']);
      expect(component.settings.treatAsAttachmentExtensions).toStrictEqual(['.foo.md']);
    });

    it('should leave settings at defaults when no legacy keys are present', async () => {
      const component = createComponent({});
      await component.loadWithPromises();
      expect(component.settings.excludePaths).toStrictEqual([]);
      expect(component.settings.shouldShowBackupWarning).toBe(true);
      // Nothing was customized, so there is nothing of the user's to carry over and no migration is offered.
      expect(component.settings.proposedRenameDeleteSettings).toBeNull();
    });

    // Issue #159: the three keys below are still declared, so every saved record carries them. Alone, they are
    // not a 3.x record and must not re-open the handover.
    it('should propose nothing for a record that carries only the still-declared keys', async () => {
      const component = createComponent({
        excludePaths: [String.raw`/\_*`],
        includePaths: [],
        treatAsAttachmentExtensions: ['.excalidraw.md']
      });
      await component.loadWithPromises();
      expect(component.settings.proposedRenameDeleteSettings).toBeNull();
    });

    it('should not re-offer a retired proposal after a reload', async () => {
      const dataHandler = new MockDataHandler({
        excludePaths: ['private'],
        shouldUpdateLinks: false
      });
      const pluginEventSource = new AsyncEvents<PluginEventMap>();
      const firstLoad = new PluginSettingsComponent({ dataHandler, pluginEventSource });
      await firstLoad.loadWithPromises();
      expect(firstLoad.settings.proposedRenameDeleteSettings).toStrictEqual({
        excludePaths: ['private'],
        shouldHandleRenames: false
      });

      await firstLoad.editAndSave((settings) => {
        settings.proposedRenameDeleteSettings = null;
      });

      const secondLoad = new PluginSettingsComponent({ dataHandler, pluginEventSource });
      await secondLoad.loadWithPromises();
      expect(secondLoad.settings.proposedRenameDeleteSettings).toBeNull();
      expect(secondLoad.settings.excludePaths).toStrictEqual(['private']);
    });

    it('should keep a pending proposal across a reload', async () => {
      const dataHandler = new MockDataHandler({ shouldUpdateLinks: false });
      const pluginEventSource = new AsyncEvents<PluginEventMap>();
      const firstLoad = new PluginSettingsComponent({ dataHandler, pluginEventSource });
      await firstLoad.loadWithPromises();
      await firstLoad.editAndSave(() => {
        // Nothing to change; the save that drops the legacy keys is the subject.
      });

      const secondLoad = new PluginSettingsComponent({ dataHandler, pluginEventSource });
      await secondLoad.loadWithPromises();
      expect(secondLoad.settings.proposedRenameDeleteSettings).toStrictEqual({ shouldHandleRenames: false });
    });

    // What an affected data.json looks like today: the defect saved the re-parked proposal to disk.
    it('should discard a saved proposal the defect wrote', async () => {
      const component = createComponent({
        excludePaths: [String.raw`/\_*`],
        proposedRenameDeleteSettings: {
          excludePaths: [String.raw`/\_*`],
          includePaths: [],
          treatAsAttachmentExtensions: ['.excalidraw.md']
        },
        treatAsAttachmentExtensions: ['.excalidraw.md']
      });
      await component.loadWithPromises();
      expect(component.settings.proposedRenameDeleteSettings).toBeNull();
    });

    it('should keep a saved proposal that carries a handed-over key', async () => {
      const component = createComponent({
        proposedRenameDeleteSettings: {
          excludePaths: ['private'],
          shouldHandleRenames: false
        }
      });
      await component.loadWithPromises();
      expect(component.settings.proposedRenameDeleteSettings).toStrictEqual({
        excludePaths: ['private'],
        shouldHandleRenames: false
      });
    });

    it('should append legacy ignore paths to existing excludePaths', async () => {
      const component = createComponent({
        excludePaths: ['existing'],
        ignoreFiles: ['regex'],
        ignoreFolders: ['folder']
      });
      await component.loadWithPromises();
      expect(component.settings.excludePaths).toStrictEqual(['existing', '/regex$/', 'folder']);
    });
  });
});
