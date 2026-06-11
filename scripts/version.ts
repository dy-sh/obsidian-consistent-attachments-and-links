import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import {
  parseVersionArgs,
  updateVersion
} from 'obsidian-dev-utils/script-utils/version';

const [, , ...args] = process.argv;
const { options, versionUpdateType } = parseVersionArgs(args);
await wrapCliTask(() => updateVersion(versionUpdateType, options));
