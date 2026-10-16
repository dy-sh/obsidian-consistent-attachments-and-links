import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { testCoverage } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

const FULL_COVERAGE_PERCENT = 100;

await wrapCliTask(() =>
  testCoverage({
    minCoverageInPercents: FULL_COVERAGE_PERCENT,
    projects: ['unit-tests']
  })
);
