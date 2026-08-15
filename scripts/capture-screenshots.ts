import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { test } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

// Desktop first, then Android — the two share one machine, and the Android leg
// Boots an emulator, so running them concurrently would collide on the device.
await wrapCliTask(async () => {
  await test({
    projects: ['capture-screenshots:desktop']
  });
  await test({
    projects: ['capture-screenshots:android']
  });
});
