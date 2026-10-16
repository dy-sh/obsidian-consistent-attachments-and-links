import { buildCompile } from '@mnaoumov/typescript-dev-toolkit/build';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => buildCompile());
