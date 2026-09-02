/**
 * @file
 *
 * Desktop integration suite for the 3.x rename/delete settings hand-over (T714-P22).
 *
 * The one seam unit tests cannot reach: a REAL `data.json` written by a 3.x install, loaded by a real
 * plugin in a real Obsidian, and saved back. That round trip is where the values are actually at risk —
 * `obsidian-dev-utils` rebuilds the saved record from the DECLARED properties alone, so a property this
 * plugin has dropped is stripped on the first save. If the converter did not park it first, the user's
 * answers are gone before Advanced Rename and Delete Handler is ever installed to receive them, and
 * nothing anywhere would report it.
 *
 * T711-P18 is why this exists: the sibling plugin shipped this same change with two defects that every
 * unit test passed and a single live run caught.
 *
 * Only this plugin is involved. The other half — the dialog that reviews a proposal and writes what the
 * user approves — belongs to Advanced Rename and Delete Handler and is covered by its own
 * `settings-migration.cross-platform.integration.test.ts`.
 *
 * Desktop-only (per G47: the file name alone picks the project). The behavior itself is
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
          editAndSave(settingsEditor: (settings: unknown) => void): Promise<void>;
          readonly settings: Record<string, unknown>;
        }

        interface PluginWithSettingsComponent {
          readonly pluginSettingsComponent: PluginSettingsComponentLike;
        }

        const RELOAD_TIMEOUT_IN_MILLISECONDS = 20_000;
        const dataPath = `.obsidian/plugins/${pluginId}/data.json`;

        // Exactly what a 3.x install leaves behind: the settings this plugin owned until 4.0.0, in the
        // Names 3.x used. `showBackupWarning` is the ANCIENT name, so the two-step conversion — ancient
        // Name to 3.x name, then 3.x name to the new owner's name — is exercised rather than assumed.
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
        // Opened, before this test wrote anything.
        await app.plugins.disablePlugin(pluginId);
        await app.plugins.enablePlugin(pluginId);

        await waitUntil({
          message: 'the plugin to register its commands again',
          predicate: () => Object.hasOwn(app.commands.commands, `${pluginId}:check-consistency`),
          timeoutInMilliseconds: RELOAD_TIMEOUT_IN_MILLISECONDS
        });

        // `getPlugin` is typed as Obsidian's `Plugin`, which knows nothing of this plugin's own members, so
        // The handle is taken as `unknown` and narrowed once.
        const pluginHandle: unknown = app.plugins.getPlugin(pluginId);
        if (!pluginHandle) {
          throw new Error(`Plugin is not loaded: ${pluginId}`);
        }
        const settingsComponent = (pluginHandle as PluginWithSettingsComponent).pluginSettingsComponent;
        const proposedAfterLoad = settingsComponent.settings['proposedRenameDeleteSettings'];

        // Force the save that rebuilds the record from the declared properties — the moment a dropped
        // Property would vanish from disk.
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
