import process from 'node:process';
import {
  CliTaskResult,
  wrapCliTask
} from 'obsidian-dev-utils/script-utils/cli-utils';
import {
  findOverExposure,
  formatOverExposureFindings
} from 'obsidian-dev-utils/script-utils/linters/over-exposure';

await wrapCliTask(() => {
  const findings = findOverExposure({ projectFolder: process.cwd() });
  process.stdout.write(formatOverExposureFindings(findings, { baseFolder: process.cwd() }));
  return CliTaskResult.Success(findings.length === 0);
});
