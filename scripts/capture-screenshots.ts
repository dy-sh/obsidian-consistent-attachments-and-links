import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

// Desktop first, then Android — the two share one machine, and the Android leg
// boots an emulator, so running them concurrently would collide on the device.
await wrapCliTask(async () => {
  await test({
    projects: ['capture-screenshots:desktop']
  });
  await test({
    projects: ['capture-screenshots:android']
  });
});
