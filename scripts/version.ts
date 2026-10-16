import {
  parseVersionArguments,
  updateVersion
} from '@mnaoumov/obsidian-dev-toolkit/version';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import process from 'node:process';

const [, , ...$arguments] = process.argv;
const { options, versionUpdateType } = parseVersionArguments($arguments);
await wrapCliTask(() => updateVersion(versionUpdateType, options));
