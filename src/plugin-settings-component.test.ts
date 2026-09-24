import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventMap } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { AsyncEvents } from 'obsidian-dev-utils/async-events';
import {
  noop,
  noopAsync
} from 'obsidian-dev-utils/function';
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
    // Round-tripped through JSON, exactly as `data.json` is, so a reload reads what the file would hold. Not
    // `structuredClone`: it keeps a key whose value is `undefined`, which JSON drops, and the saved record
    // carries one for a private settings field (an obsidian-dev-utils defect), so a clone would reload a record
    // no real `data.json` can contain.
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
      expect(component.settings.proposedCollectSettings).toStrictEqual({ shouldCollectAttachmentsAutomatically: true });
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
      expect(component.settings.proposedCollectSettings).toBeNull();
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

  describe('collect settings handover', () => {
    it('should park the 4.x collect settings for Custom Attachment Location', async () => {
      const component = createComponent({
        attachmentUnitFolderPaths: ['assets/page_files'],
        collectAttachmentUsedByMultipleNotesMode: 'Copy',
        excludePathsFromAttachmentCollecting: ['archive'],
        moveAttachmentToProperFolderUsedByMultipleNotesMode: 'Prompt',
        shouldAddCommandsToFileMenu: false,
        shouldCollectAttachmentsAutomatically: true
      });
      await component.loadWithPromises();
      // `shouldAddCommandsToFileMenu` is not proposed: that plugin has no toggle for it to land in.
      expect(component.settings.proposedCollectSettings).toStrictEqual({
        attachmentUnitFolderPaths: ['assets/page_files'],
        collectAttachmentUsedByMultipleNotesMode: 'Copy',
        excludePathsFromAttachmentCollecting: ['archive'],
        moveAttachmentToProperFolderUsedByMultipleNotesMode: 'Prompt',
        shouldCollectAttachmentsAutomatically: true
      });
    });

    it('should propose only the collect keys the record carries', async () => {
      const component = createComponent({ collectAttachmentUsedByMultipleNotesMode: 'Move' });
      await component.loadWithPromises();
      expect(component.settings.proposedCollectSettings).toStrictEqual({ collectAttachmentUsedByMultipleNotesMode: 'Move' });
    });

    it('should strip the collect keys from the saved record', async () => {
      const dataHandler = new MockDataHandler({
        collectAttachmentUsedByMultipleNotesMode: 'Copy',
        shouldAddCommandsToFileMenu: false
      });
      const component = new PluginSettingsComponent({ dataHandler, pluginEventSource: new AsyncEvents<PluginEventMap>() });
      await component.loadWithPromises();
      await component.editAndSave(noop);
      const saved = await dataHandler.loadData() as Record<string, unknown>;
      expect(saved).not.toHaveProperty('collectAttachmentUsedByMultipleNotesMode');
      expect(saved).not.toHaveProperty('shouldAddCommandsToFileMenu');
      expect(saved['proposedCollectSettings']).toStrictEqual({ collectAttachmentUsedByMultipleNotesMode: 'Copy' });
    });

    // The failure this guards is an applied migration offered again on the next load, because a parked key
    // was still in the record and got parked a second time.
    it('should not bring a retired offer back on the next load', async () => {
      const dataHandler = new MockDataHandler({ shouldCollectAttachmentsAutomatically: true });
      const first = new PluginSettingsComponent({ dataHandler, pluginEventSource: new AsyncEvents<PluginEventMap>() });
      await first.loadWithPromises();
      await first.editAndSave((settings) => {
        settings.proposedCollectSettings = null;
      });

      const second = new PluginSettingsComponent({ dataHandler, pluginEventSource: new AsyncEvents<PluginEventMap>() });
      await second.loadWithPromises();
      expect(second.settings.proposedCollectSettings).toBeNull();
    });
  });
});
