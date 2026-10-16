import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { testWatch } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

await wrapCliTask(() =>
  testWatch({
    projects: ['unit-tests']
  })
);
