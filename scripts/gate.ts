import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import {
  gate,
  parseGateArguments
} from 'obsidian-dev-utils/script-utils/gate';

const [, , ...$arguments] = process.argv;
const options = parseGateArguments($arguments);
await wrapCliTask(() => gate(options));
