import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  enableCommunityPlugin,
  installCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

// Consistent Attachments and Links works as you move, rename, and delete notes, so there is
// Nothing for a code-button to drive - you just perform the file operations and watch the plugin
// Keep everything consistent. The only helper the vault needs is the shared CodeScript Toolkit
// Installer used by the prerequisite note's button.
export async function installAndEnable(app: App, pluginId: string): Promise<void> {
  await installCommunityPlugin({ app, pluginId });
  await enableCommunityPlugin({ app, pluginId });
  new Notice(`Installed and enabled: ${pluginId}`);
}
