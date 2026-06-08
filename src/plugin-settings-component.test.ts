import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

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
    this.data = data;
    await noopAsync();
  }
}

function createComponent(data: unknown = {}): PluginSettingsComponent {
  return new PluginSettingsComponent({
    dataHandler: new MockDataHandler(data),
    pluginEventSource: strictProxy<PluginEventSource>({})
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
      // Is used to feed the validator an invalid pattern directly.
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
      await component.loadFromFile(true);
      expect(component.settings.excludePaths).toStrictEqual(['/secret$/']);
    });

    it('should convert ignoreFolders into exclude paths', async () => {
      const component = createComponent({ ignoreFolders: ['private'] });
      await component.loadFromFile(true);
      expect(component.settings.excludePaths).toStrictEqual(['private']);
    });

    it('should map deleteEmptyFolders true to DeleteWithEmptyParents', async () => {
      const component = createComponent({ deleteEmptyFolders: true });
      await component.loadFromFile(true);
      expect(component.settings.emptyFolderBehavior).toBe(EmptyFolderBehavior.DeleteWithEmptyParents);
    });

    it('should map deleteEmptyFolders false to Keep', async () => {
      const component = createComponent({ deleteEmptyFolders: false });
      await component.loadFromFile(true);
      expect(component.settings.emptyFolderBehavior).toBe(EmptyFolderBehavior.Keep);
    });

    it('should prefer emptyAttachmentFolderBehavior over deleteEmptyFolders', async () => {
      const component = createComponent({
        deleteEmptyFolders: true,
        emptyAttachmentFolderBehavior: EmptyFolderBehavior.Delete
      });
      await component.loadFromFile(true);
      expect(component.settings.emptyFolderBehavior).toBe(EmptyFolderBehavior.Delete);
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
      await component.loadFromFile(true);
      expect(component.settings.shouldCollectAttachmentsAutomatically).toBe(true);
      expect(component.settings.shouldChangeNoteBacklinksDisplayText).toBe(true);
      expect(component.settings.shouldDeleteAttachmentsWithNote).toBe(true);
      expect(component.settings.shouldDeleteExistingFilesWhenMovingNote).toBe(true);
      expect(component.settings.shouldMoveAttachmentsWithNote).toBe(true);
      expect(component.settings.shouldShowBackupWarning).toBe(false);
      expect(component.settings.shouldUpdateLinks).toBe(false);
    });

    it('should leave settings at defaults when no legacy keys are present', async () => {
      const component = createComponent({});
      await component.loadFromFile(true);
      expect(component.settings.excludePaths).toStrictEqual([]);
      expect(component.settings.shouldShowBackupWarning).toBe(true);
    });

    it('should append legacy ignore paths to existing excludePaths', async () => {
      const component = createComponent({
        excludePaths: ['existing'],
        ignoreFiles: ['regex'],
        ignoreFolders: ['folder']
      });
      await component.loadFromFile(true);
      expect(component.settings.excludePaths).toStrictEqual(['existing', '/regex$/', 'folder']);
    });
  });
});
