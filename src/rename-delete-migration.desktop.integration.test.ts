/**
 * @file
 *
 * Desktop integration suite for the 3.x rename/delete settings hand-over.
 *
 * The one seam unit tests cannot reach: a REAL `data.json` written by a 3.x install, loaded by a real
 * plugin in a real Obsidian, and saved back. That round trip is where the values are actually at risk —
 * `obsidian-dev-utils` rebuilds the saved record from the DECLARED properties alone, so a property this
 * plugin has dropped is stripped on the first save. If the converter did not park it first, the user's
 * answers are gone before Advanced Rename and Delete Handler is ever installed to receive them, and
 * nothing anywhere would report it.
 *
 * The sibling plugin is why this exists: it shipped this same change with two defects that every
 * unit test passed and a single live run caught.
 *
 * Only this plugin is involved. The other half — the dialog that reviews a proposal and writes what the
 * user approves — belongs to Advanced Rename and Delete Handler and is covered by its own
 * `settings-migration.cross-platform.integration.test.ts`.
 *
 * Desktop-only (the file name alone picks the project). The behavior itself is
 * platform-agnostic and can move to `*.cross-platform.` the day an emulator is available here.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';

describe('The 3.x rename/delete settings hand-over', () => {
  it('parks a real data.json\'s values for the new owner, and keeps them across a save', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, pluginId }) {
        interface PluginSettingsComponentLike {
          editAndSave: (settingsEditor: (settings: unknown) => void) => Promise<void>;
          readonly settings: Record<string, unknown>;
        }

        interface PluginWithSettingsComponent {
          readonly pluginSettingsComponent: PluginSettingsComponentLike;
        }

        const RELOAD_TIMEOUT_IN_MILLISECONDS = 20_000;
        const dataPath = `.obsidian/plugins/${pluginId}/data.json`;

        // Exactly what a 3.x install leaves behind: the settings this plugin owned until 4.0.0, in the
        // names 3.x used. `showBackupWarning` is the ANCIENT name, so the two-step conversion — ancient
        // name to 3.x name, then 3.x name to the new owner's name — is exercised rather than assumed.
        await app.vault.adapter.write(
          dataPath,
          JSON.stringify({
            consistencyReportFile: 'consistency-report.md',
            emptyFolderBehavior: 'Delete',
            shouldChangeNoteBacklinksDisplayText: false,
            shouldDeleteAttachmentsWithNote: true,
            shouldDeleteExistingFilesWhenMovingNote: true,
            shouldMoveAttachmentsWithNote: true,
            shouldUpdateLinks: false,
            showBackupWarning: false,
            treatAsAttachmentExtensions: ['.foo.md']
          })
        );

        // A reload is what makes the written file real: the plugin read its settings when the vault
        // opened, before this test wrote anything.
        await app.plugins.disablePlugin(pluginId);
        await app.plugins.enablePlugin(pluginId);

        await waitUntil({
          message: 'the plugin to register its commands again',
          predicate: () => Object.hasOwn(app.commands.commands, `${pluginId}:check-consistency`),
          timeoutInMilliseconds: RELOAD_TIMEOUT_IN_MILLISECONDS
        });

        // `getPlugin` is typed as Obsidian's `Plugin`, which knows nothing of this plugin's own members, so
        // the handle is taken as `unknown` and narrowed once.
        const pluginHandle: unknown = app.plugins.getPlugin(pluginId);
        if (!pluginHandle) {
          throw new Error(`Plugin is not loaded: ${pluginId}`);
        }
        const settingsComponent = (pluginHandle as PluginWithSettingsComponent).pluginSettingsComponent;
        const proposedAfterLoad = settingsComponent.settings['proposedRenameDeleteSettings'];

        // Force the save that rebuilds the record from the declared properties — the moment a dropped
        // property would vanish from disk.
        await settingsComponent.editAndSave(() => {
          // Nothing to change; the save itself is the subject.
        });

        const savedRecord = JSON.parse(await app.vault.adapter.read(dataPath)) as Record<string, unknown>;

        return {
          droppedKeysStillOnDisk: [
            'emptyFolderBehavior',
            'shouldChangeNoteBacklinksDisplayText',
            'shouldDeleteAttachmentsWithNote',
            'shouldDeleteExistingFilesWhenMovingNote',
            'shouldMoveAttachmentsWithNote',
            'shouldUpdateLinks'
          ].filter((key) => Object.hasOwn(savedRecord, key)),
          proposedAfterLoad,
          proposedOnDisk: savedRecord['proposedRenameDeleteSettings'],
          // Proposed but NOT handed over: other features here still read it, so it must survive.
          treatAsAttachmentExtensionsOnDisk: savedRecord['treatAsAttachmentExtensions']
        };
      },
      input: { pluginId: PLUGIN_ID }
    });

    const expectedProposal = {
      emptyFolderBehavior: 'Delete',
      shouldDeleteConflictingAttachments: true,
      shouldHandleDeletions: true,
      shouldHandleRenames: false,
      shouldRenameAttachmentFolder: true,
      shouldUpdateFileNameAliases: false,
      treatAsAttachmentExtensions: ['.foo.md']
    };

    expect(result.proposedAfterLoad).toMatchObject(expectedProposal);
    // The whole point: the values outlive the save that strips the properties they came from.
    expect(result.proposedOnDisk).toMatchObject(expectedProposal);
    expect(result.droppedKeysStillOnDisk).toStrictEqual([]);
    expect(result.treatAsAttachmentExtensionsOnDisk).toStrictEqual(['.foo.md']);
  });
});

// Issue #159: the converter runs on every load, and the three proposal keys this plugin still declares sit in
// every saved record. Parking them alone re-opened a handover the user had already applied or dismissed, on
// every start, and wrote the proposal back to disk.
describe('A finished rename/delete hand-over', () => {
  // The reporter's settings, as a 4.x save leaves them once the offer was retired.
  const HANDED_OVER_RECORD = {
    excludePaths: [String.raw`/\_*`],
    includePaths: [],
    proposedRenameDeleteSettings: null,
    treatAsAttachmentExtensions: ['.excalidraw.md']
  };

  it('stays finished across a reload', async () => {
    expect(await reloadWithRecord(HANDED_OVER_RECORD)).toStrictEqual({ inMemory: null, onDisk: null });
  });

  it('clears the proposal the defect saved to disk', async () => {
    // The defect's own leftover: the three still-declared keys, parked and saved on a later start.
    const defectRecord = {
      ...HANDED_OVER_RECORD,
      proposedRenameDeleteSettings: {
        excludePaths: [String.raw`/\_*`],
        includePaths: [],
        treatAsAttachmentExtensions: ['.excalidraw.md']
      }
    };
    expect(await reloadWithRecord(defectRecord)).toStrictEqual({ inMemory: null, onDisk: null });
  });
});

interface ProposalAfterReload {
  readonly inMemory: unknown;
  readonly onDisk: unknown;
}

/**
 * Writes `record` as this plugin's `data.json`, reloads the plugin, and reads the pending proposal back from
 * both the loaded settings and the file the load may have rewritten.
 *
 * @param record - The saved record to load.
 * @returns The proposal after the reload, in memory and on disk.
 */
async function reloadWithRecord(record: Record<string, unknown>): Promise<ProposalAfterReload> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, pluginId, savedRecord }) {
      interface PluginSettingsComponentLike {
        readonly settings: Record<string, unknown>;
      }

      interface PluginWithSettingsComponent {
        readonly pluginSettingsComponent: PluginSettingsComponentLike;
      }

      const RELOAD_TIMEOUT_IN_MILLISECONDS = 20_000;
      const dataPath = `.obsidian/plugins/${pluginId}/data.json`;

      await app.vault.adapter.write(dataPath, JSON.stringify(savedRecord));
      await app.plugins.disablePlugin(pluginId);
      await app.plugins.enablePlugin(pluginId);

      await waitUntil({
        message: 'the plugin to register its commands again',
        predicate: () => Object.hasOwn(app.commands.commands, `${pluginId}:check-consistency`),
        timeoutInMilliseconds: RELOAD_TIMEOUT_IN_MILLISECONDS
      });

      const pluginHandle: unknown = app.plugins.getPlugin(pluginId);
      if (!pluginHandle) {
        throw new Error(`Plugin is not loaded: ${pluginId}`);
      }
      const inMemory = (pluginHandle as PluginWithSettingsComponent).pluginSettingsComponent.settings['proposedRenameDeleteSettings'];
      const recordOnDisk = JSON.parse(await app.vault.adapter.read(dataPath)) as Record<string, unknown>;
      return { inMemory, onDisk: recordOnDisk['proposedRenameDeleteSettings'] ?? null };
    },
    input: { pluginId: PLUGIN_ID, savedRecord: record }
  });
}
