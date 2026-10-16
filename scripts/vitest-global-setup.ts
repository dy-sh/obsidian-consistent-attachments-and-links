/**
 * @file
 *
 * The global setup of the desktop and Android projects: `obsidian-integration-testing`'s own, plus `Advanced
 * Rename and Delete Handler`, which this plugin declares as a dependency and cannot load without, plus
 * `@mnaoumov/obsidian-dev-toolkit`'s integration-test harness plugin, which makes the whole library reachable
 * as `lib.<helper>` inside an `evalInObsidian` closure. The misplaced-attachment report suite needs
 * `lib.publishPluginApi` from it to stand in for `Custom Attachment Location`.
 *
 * The dependency is enabled after this plugin, so every run also drives the live path: this plugin loads
 * blocked, and finishes loading the moment its dependency's API appears.
 */

import {
  getIntegrationTestPluginPopulate,
  OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID
} from '@mnaoumov/obsidian-dev-toolkit/test-runners/integration-test-plugin';
import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

import {
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
  getAdvancedRenameAndDeleteHandlerPopulate
} from './helpers/advanced-rename-and-delete-handler-seed.ts';

export const { setup, teardown } = createSetup({
  enableCommunityPlugins: [ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID, OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID],
  populate: async () => ({
    ...await getAdvancedRenameAndDeleteHandlerPopulate(),
    ...getIntegrationTestPluginPopulate()
  })
});
