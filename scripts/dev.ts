import { dev } from 'obsidian-dev-utils/script-utils/bundlers/esbuild';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';

await wrapCliTask(() => dev());
