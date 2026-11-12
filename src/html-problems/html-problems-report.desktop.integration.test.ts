/**
 * @file
 *
 * The report's `HTML problems` section against the REAL `Advanced Metadata Cache` `2.5.0`, the first release
 * publishing contract `1.15.0`, with its opt-in `HTML` module turned on. A stand-in API would only prove that this
 * plugin prints what it is handed; the point here is that the verdict is the running Obsidian's sanitizer's.
 *
 * The released plugin is written into the vault and enabled inside the closure, then disabled and removed, so
 * the other suites sharing the vault never see it. The last phase disables it and checks the section says it did
 * not check, rather than reporting a clean vault.
 */

import { downloadReleasedPlugin } from '@mnaoumov/obsidian-dev-toolkit/test-runners/released-plugin';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const ADVANCED_METADATA_CACHE_PLUGIN_ID = 'advanced-metadata-cache';
const ADVANCED_METADATA_CACHE_REPO = 'mnaoumov/obsidian-advanced-metadata-cache';
const ADVANCED_METADATA_CACHE_VERSION = '2.5.0';
const CONSISTENCY_COMMAND_ID = 'consistent-attachments-and-links:check-consistency';

// Four waits on this constant (API, indexed diagnostics, two reports), under the transport's ~30 s closure cap.
const WAIT_TIMEOUT_IN_MILLISECONDS = 6000;

const CONTENT = 'Text <nonExistingTag>bravo</nonExistingTag> <alpha-widget>charlie</alpha-widget> <b>bold</b>\n\n<script>alert(1)</script>\n\n`<code-example>`\n';

interface ProbeResult {
  readonly notePath: string;
  readonly withoutPlugin: string;
  readonly withPlugin: string;
}

describe('Consistency report: HTML problems', () => {
  it('reports unknown and sanitized tags from Advanced Metadata Cache, and says when it could not check', async () => {
    const released = await downloadReleasedPlugin({
      pluginId: ADVANCED_METADATA_CACHE_PLUGIN_ID,
      repo: ADVANCED_METADATA_CACHE_REPO,
      version: ADVANCED_METADATA_CACHE_VERSION
    });

    const result = await evalInObsidian({
      async callback({
        advancedMetadataCachePluginId,
        app,
        consistencyCommandId,
        content,
        lib: {
          findPluginApi,
          waitUntil
        },
        mainJs,
        manifestJson,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        interface HtmlApi {
          readonly getHtmlDiagnostics: (path: string) => null | unknown[];
        }

        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const notePath = `html-problems-${stamp}.md`;
        const reportPath = 'consistency-report.md';
        const pluginFolder = `${app.vault.configDir}/plugins/${advancedMetadataCachePluginId}`;

        function findApi(): HtmlApi | null {
          return findPluginApi<HtmlApi>({ apiVersionRange: '^1.15.0', pluginId: advancedMetadataCachePluginId });
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
          const start = text.indexOf('# HTML problems');
          const end = text.indexOf('# Path compatibility');
          return start === -1 ? '' : text.slice(start, end === -1 ? undefined : end);
        }

        await app.vault.adapter.mkdir(pluginFolder);
        await app.vault.adapter.write(`${pluginFolder}/main.js`, mainJs);
        await app.vault.adapter.write(`${pluginFolder}/manifest.json`, manifestJson);
        await app.vault.adapter.write(`${pluginFolder}/data.json`, JSON.stringify({ isHtmlModuleEnabled: true }));

        try {
          await app.vault.create(notePath, content);
          await app.plugins.loadManifests();
          await app.plugins.enablePlugin(advancedMetadataCachePluginId);
          await waitUntil({
            message: 'Advanced Metadata Cache did not publish contract 1.15.0',
            predicate: () => findApi() !== null,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
          await waitUntil({
            message: 'the note\'s HTML diagnostics were not built',
            predicate: () => (findApi()?.getHtmlDiagnostics(notePath)?.length ?? 0) > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          const withPlugin = await runReport();

          await app.plugins.disablePlugin(advancedMetadataCachePluginId);
          const withoutPlugin = await runReport();

          return { notePath, withoutPlugin, withPlugin };
        } finally {
          await app.plugins.disablePlugin(advancedMetadataCachePluginId);
          await app.vault.adapter.rmdir(pluginFolder, true);
          await app.plugins.loadManifests();
          await trashIfExists(notePath);
          await trashIfExists(reportPath);
        }
      },
      input: {
        advancedMetadataCachePluginId: ADVANCED_METADATA_CACHE_PLUGIN_ID,
        consistencyCommandId: CONSISTENCY_COMMAND_ID,
        content: CONTENT,
        mainJs: released.mainJs,
        manifestJson: released.manifestJson,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    const noteName = result.notePath.replace(/\.md$/u, '');
    const noteBlockStart = result.withPlugin.indexOf(noteName);
    expect(noteBlockStart).toBeGreaterThan(-1);
    const noteBlock = result.withPlugin.slice(noteBlockStart).split('\n\n', 1)[0] ?? '';

    expect(noteBlock).toContain('- (line 1): `<nonExistingTag>` is not a known HTML element');
    expect(noteBlock).toContain('- (line 3): `<script>` is changed or removed when Obsidian renders it');
    // A custom element is not unknown for want of registration, though Obsidian's sanitizer does drop it (measured
    // in Obsidian 1.15). Ordinary HTML is not a problem, and a code span is not HTML at all.
    expect(noteBlock).toContain('- (line 1): `<alpha-widget>` is changed or removed when Obsidian renders it');
    expect(noteBlock).not.toContain('`<alpha-widget>` is not a known HTML element');
    expect(noteBlock).not.toContain('<b>');
    expect(noteBlock).not.toContain('code-example');

    expect(result.withoutPlugin).toContain('Not checked: needs the `Advanced Metadata Cache` plugin');
    expect(result.withoutPlugin).not.toContain(noteName);
  }, 180_000);
});
