import {
  CliTaskResult,
  wrapCliTask
} from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import {
  findOverExposure,
  formatOverExposureFindings
} from '@mnaoumov/typescript-dev-toolkit/linters/over-exposure';
import process from 'node:process';

await wrapCliTask(() => {
  const findings = findOverExposure({ projectFolder: process.cwd() });
  process.stdout.write(formatOverExposureFindings(findings, { baseFolder: process.cwd() }));
  return CliTaskResult.Success(findings.length === 0);
});
