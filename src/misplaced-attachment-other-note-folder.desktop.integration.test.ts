/**
 * @file
 *
 * Desktop integration suite for an attachment filed in ANOTHER note's attachment folder, run against the REAL
 * Custom Attachment Location with the template `./!!files/${noteFileName}` — the setup the case was reported
 * from.
 *
 * `A.md` embeds `!!files/B/image.png`. By the template A's attachments belong in `!!files/A`, and `!!files/B`
 * is B's. Three phases, one staging:
 *
 * 1. **Only A embeds it** — misplaced for A, named against `!!files/A`. `B.md` exists and embeds nothing, so
 *    the folder's owner existing is not enough to make the image at home.
 * 2. **B embeds it too** — nothing is reported. The image sits in the folder of a note that references it,
 *    and no single folder could satisfy both notes; reporting A here left a shared attachment that the report
 *    could never be brought clean about.
 * 3. **Custom Attachment Location disabled**, Obsidian's own `./attachments` — the image is in neither note's
 *    folder, so BOTH references are reported. This is the control for phase 2: it shows the silence there is
 *    the at-home rule, not the second reference being dropped.
 *
 * The released plugin is written into the vault and enabled inside the closure, then disabled and removed,
 * rather than seeded for every suite: its patches would change what every other suite's attachment paths
 * resolve to. `12.0.1` is pinned because it is what the reporting vault runs, and because `13.0.0` onwards
 * requires Advanced Rename and Delete Handler's API `^1.1.0`, which the seeded `1.3.0` does not publish — a
 * later release loads blocked here and never installs its extended function.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

import { downloadReleasedPlugin } from '../scripts/helpers/download-released-plugin.ts';

const CONSISTENCY_COMMAND_ID = 'consistent-attachments-and-links:check-consistency';
const CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID = 'obsidian-custom-attachment-location';
const CUSTOM_ATTACHMENT_LOCATION_REPO = 'mnaoumov/obsidian-custom-attachment-location';
const CUSTOM_ATTACHMENT_LOCATION_VERSION = '12.0.1';

/*
 * Under the transport's ~30 s per-closure cap: the closure declares six waits on this one constant (the
 * extended function, two indexings, three report regenerations), 24 000 ms in all, and each lands well under
 * a second.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 4000;

interface ProbeResult {
  readonly aOnly: string;
  readonly both: string;
  readonly root: string;
  readonly withoutPlugin: string;
}

describe('Consistency report: an attachment in another note\'s attachment folder', () => {
  it('reports it for the note whose folder it is not in, and not once that folder\'s note references it too', async () => {
    const released = await downloadReleasedPlugin({
      pluginId: CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID,
      repo: CUSTOM_ATTACHMENT_LOCATION_REPO,
      version: CUSTOM_ATTACHMENT_LOCATION_VERSION
    });

    const result = await evalInObsidian({
      async callback({
        app,
        consistencyCommandId,
        customAttachmentLocationPluginId,
        lib: { waitUntil },
        mainJs,
        manifestJson,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        interface ExtendedHolder {
          extended?: unknown;
        }

        interface VaultConfigAccess {
          getConfig: (key: string) => unknown;
          setConfig: (key: string, value: unknown) => void;
        }

        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const root = `other-note-folder-${stamp}`;
        const reportPath = 'consistency-report.md';
        const pluginFolder = `${app.vault.configDir}/plugins/${customAttachmentLocationPluginId}`;
        const vaultUnknown: unknown = app.vault;
        const vaultConfig = vaultUnknown as VaultConfigAccess;
        const priorAttachmentFolder = vaultConfig.getConfig('attachmentFolderPath');

        // Read afresh every time: the plugin REPLACES `getAvailablePathForAttachments`, so a reference taken
        // before it loaded points at the unpatched function for good.
        function hasExtendedFunction(): boolean {
          const functionUnknown: unknown = app.vault.getAvailablePathForAttachments;
          return typeof (functionUnknown as ExtendedHolder).extended === 'function';
        }

        async function trashIfExists(path: string): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        async function runReport(): Promise<string> {
          await trashIfExists(reportPath);
          app.commands.executeCommandById(consistencyCommandId);
          await waitUntil({
            message: 'the consistency report was not regenerated',
            predicate: () => Boolean(app.vault.getAbstractFileByPath(reportPath)),
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
          const reportFile = app.vault.getFileByPath(reportPath);
          const text = reportFile ? await app.vault.read(reportFile) : '';
          const index = text.indexOf('# Misplaced attachments');
          // The section is written last, so it runs to the end of the report.
          return index === -1 ? '' : text.slice(index);
        }

        await app.vault.adapter.mkdir(pluginFolder);
        await app.vault.adapter.write(`${pluginFolder}/main.js`, mainJs);
        await app.vault.adapter.write(`${pluginFolder}/manifest.json`, manifestJson);
        await app.vault.adapter.write(
          `${pluginFolder}/data.json`,
          // eslint-disable-next-line no-template-curly-in-string -- Custom Attachment Location's own token syntax.
          JSON.stringify({ attachmentFolderPath: './!!files/${noteFileName}' })
        );

        try {
          await app.plugins.loadManifests();
          await app.plugins.enablePlugin(customAttachmentLocationPluginId);
          await waitUntil({
            message: 'Custom Attachment Location did not install its extended function',
            predicate: hasExtendedFunction,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          await app.vault.createFolder(`${root}/!!files/B`);
          await app.vault.createBinary(`${root}/!!files/B/image.png`, new ArrayBuffer(4));
          const noteB = await app.vault.create(`${root}/B.md`, 'B\n');
          const noteA = await app.vault.create(`${root}/A.md`, '![](!!files/B/image.png)\n');
          await waitUntil({
            message: 'A\'s embed was not indexed',
            predicate: () => (app.metadataCache.getFileCache(noteA)?.embeds?.length ?? 0) > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          // Phase 1 — only A embeds it.
          const aOnly = await runReport();

          // Phase 2 — B embeds it too.
          await app.vault.modify(noteB, '![](!!files/B/image.png)\n');
          await waitUntil({
            message: 'B\'s embed was not indexed',
            predicate: () => (app.metadataCache.getFileCache(noteB)?.embeds?.length ?? 0) > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
          const both = await runReport();

          // Phase 3 — the control: Obsidian's own setting, which puts neither note's folder at `!!files/B`.
          await app.plugins.disablePlugin(customAttachmentLocationPluginId);
          vaultConfig.setConfig('attachmentFolderPath', './attachments');
          const withoutPlugin = await runReport();

          return { aOnly, both, root, withoutPlugin };
        } finally {
          await app.plugins.disablePlugin(customAttachmentLocationPluginId);
          vaultConfig.setConfig('attachmentFolderPath', priorAttachmentFolder);
          await app.vault.adapter.rmdir(pluginFolder, true);
          await app.plugins.loadManifests();

          // The desktop suite shares one vault and sibling suites assert on exactly which files survive.
          const createdPaths = app.vault.getFiles().map((file) => file.path).filter((path) => path.includes(stamp)).reverse();
          for (const createdPath of createdPaths) {
            await trashIfExists(createdPath);
          }
          await trashIfExists(root);
          await trashIfExists(reportPath);
        }
      },
      input: {
        consistencyCommandId: CONSISTENCY_COMMAND_ID,
        customAttachmentLocationPluginId: CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID,
        mainJs: released.mainJs,
        manifestJson: released.manifestJson,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    const imagePath = `${result.root}/!!files/B/image.png`;

    // Phase 1: A is reported, against its own folder.
    expect(result.aOnly).toContain('[[A]]:');
    expect(result.aOnly).toContain(`Attachment \`${imagePath}\` should be in \`${result.root}/!!files/A\``);
    expect(result.aOnly).not.toContain('[[B]]:');

    // Phase 2: the image is at home in B's folder, and B references it, so nothing is reported.
    expect(result.both).toContain('# Misplaced attachments');
    expect(result.both).not.toContain(imagePath);

    // Phase 3, the control: in neither note's folder, so both references are reported.
    expect(result.withoutPlugin).toContain('[[A]]:');
    expect(result.withoutPlugin).toContain('[[B]]:');
    expect(result.withoutPlugin).toContain(`should be in \`${result.root}/attachments\``);
  }, 180_000);
});
