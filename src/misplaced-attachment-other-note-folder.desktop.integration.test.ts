/**
 * @file
 *
 * Desktop integration suite for a note linking an attachment filed in ANOTHER note's attachment folder, run
 * against the REAL Custom Attachment Location with the template `./!!files/${noteFileName}` — the setup the
 * case was reported from.
 *
 * `A.md` embeds `!!files/B/image.png`. By the template A's attachments belong in `!!files/A`, and `!!files/B`
 * is B's, so A links an EXTERNAL attachment, whoever else uses it (owner, 2026-09-29). Five phases, one staging:
 *
 * 1. **Only A embeds it** — A is reported with no `also used by` clause. `B.md` exists and embeds nothing.
 * 2. **B and C embed it too** — A and C are each reported, naming B as its proper note and the other user; B,
 *    whose own folder holds it, is not. 5.0.2 reported nothing here.
 * 3. **`Report unowned`** — nothing is reported, because B owns it. This is 5.0.2's rule, now opt-in.
 * 4. **`Report`, with `!!files` listed as a shared location** — nothing is reported.
 * 5. **Custom Attachment Location disabled**, Obsidian's own `./attachments` — the image is in no note's folder,
 *    so all three references are reported and none names a proper note. This is the control for phase 2: it
 *    shows B's silence there is the proper-note rule, not its reference being dropped.
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
const PLUGIN_ID = 'consistent-attachments-and-links';

/*
 * Under the transport's ~30 s per-closure cap: the closure declares eight waits on this one constant (the
 * extended function, two indexings, five report regenerations), 24 000 ms in all, and each lands well under
 * a second.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 3000;

interface ProbeResult {
  readonly aOnly: string;
  readonly root: string;
  readonly shared: string;
  readonly unowned: string;
  readonly used: string;
  readonly withoutPlugin: string;
}

describe('Consistency report: a link to an attachment in another note\'s attachment folder', () => {
  it('reports it as external, names its proper note and other users, and honours the mode and shared locations', async () => {
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
        pluginId,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        interface ExtendedHolder {
          extended?: unknown;
        }

        interface ReportSettings {
          externalAttachmentLinkMode: string;
          sharedAttachmentPaths: string[];
        }

        interface SettingsComponent {
          editAndSave: (editor: (settings: ReportSettings) => void) => Promise<void>;
        }

        interface SettingsHolder {
          pluginSettingsComponent: SettingsComponent;
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
        const pluginUnknown: unknown = app.plugins.getPlugin(pluginId);
        const { pluginSettingsComponent } = pluginUnknown as SettingsHolder;

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

        async function setReportSettings(mode: string, sharedAttachmentPaths: string[]): Promise<void> {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.externalAttachmentLinkMode = mode;
            settings.sharedAttachmentPaths = sharedAttachmentPaths;
          });
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
          const noteC = await app.vault.create(`${root}/C.md`, 'C\n');
          const noteA = await app.vault.create(`${root}/A.md`, '![](!!files/B/image.png)\n');
          await waitUntil({
            message: 'A\'s embed was not indexed',
            predicate: () => (app.metadataCache.getFileCache(noteA)?.embeds?.length ?? 0) > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          // Phase 1 — only A embeds it.
          const aOnly = await runReport();

          // Phase 2 — B, whose folder holds it, and C embed it too.
          await app.vault.modify(noteB, '![](!!files/B/image.png)\n');
          await app.vault.modify(noteC, '![](!!files/B/image.png)\n');
          await waitUntil({
            message: 'B\'s and C\'s embeds were not indexed',
            predicate: () =>
              (app.metadataCache.getFileCache(noteB)?.embeds?.length ?? 0) > 0
              && (app.metadataCache.getFileCache(noteC)?.embeds?.length ?? 0) > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
          const used = await runReport();

          // Phase 3 — 5.0.2's rule, opt-in.
          await setReportSettings('ReportUnowned', []);
          const unowned = await runReport();

          // Phase 4 — the whole `!!files` tree is a shared location.
          await setReportSettings('Report', [`${root}/!!files`]);
          const shared = await runReport();
          await setReportSettings('Report', []);

          // Phase 5 — the control: Obsidian's own setting, which puts no note's folder at `!!files/B`.
          await app.plugins.disablePlugin(customAttachmentLocationPluginId);
          vaultConfig.setConfig('attachmentFolderPath', './attachments');
          const withoutPlugin = await runReport();

          return { aOnly, root, shared, unowned, used, withoutPlugin };
        } finally {
          await setReportSettings('Report', []);
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
        pluginId: PLUGIN_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    const imageName = 'image.png';

    // Phase 1: A is reported against its own folder, and nothing else uses the image.
    expect(result.aOnly).toMatch(/^- \[\[A\]\] links to external .*image\.png[^\n]*\]\]$/mu);
    expect(result.aOnly).not.toContain('also used by');
    expect(result.aOnly).toContain(`This note's attachment folder is \`${result.root}/!!files/A\``);
    expect(result.aOnly).not.toContain('[[B]] links');

    // Phase 2: A and C are each reported, naming B as the proper note first; B is not.
    expect(result.used).toMatch(/^- \[\[A\]\] links to external .*image\.png.* \(also used by \[\[B\]\] \(its proper note\), \[\[C\]\]\)$/mu);
    expect(result.used).toMatch(/^- \[\[C\]\] links to external .*image\.png.* \(also used by \[\[B\]\] \(its proper note\), \[\[A\]\]\)$/mu);
    expect(result.used).not.toContain('[[B]] links');

    // Phase 3: B owns it, so `Report unowned` reports nothing about it.
    expect(result.unowned).toContain('# Misplaced attachments');
    expect(result.unowned).not.toContain(imageName);

    // Phase 4: a shared location is never reported.
    expect(result.shared).toContain('# Misplaced attachments');
    expect(result.shared).not.toContain(imageName);

    // Phase 5, the control: in no note's folder, so all three references are reported and nobody owns it.
    expect(result.withoutPlugin).toContain('[[A]] links to external');
    expect(result.withoutPlugin).toContain('[[B]] links to external');
    expect(result.withoutPlugin).toContain('[[C]] links to external');
    expect(result.withoutPlugin).not.toContain('its proper note');
    expect(result.withoutPlugin).toContain(`This note's attachment folder is \`${result.root}/attachments\``);
  }, 180_000);
});
