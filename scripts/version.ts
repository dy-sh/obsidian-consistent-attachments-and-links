import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import {
  parseVersionArguments,
  updateVersion
} from 'obsidian-dev-utils/script-utils/version';

const [, , ...$arguments] = process.argv;
const { options, versionUpdateType } = parseVersionArguments($arguments);
await wrapCliTask(() => updateVersion(versionUpdateType, options));
