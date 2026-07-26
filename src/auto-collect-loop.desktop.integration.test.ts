import { registerAutoCollectLoopSuite } from './auto-collect-loop-shared.integration.test.ts';

// Desktop-only: no Android emulator is available in this environment. The auto-collect loop is
// Platform-agnostic (the same metadataCache('changed') handler and attachment-path logic run on both
// Platforms), so an Android entry point can call the same shared suite later (G97 escape hatch).
registerAutoCollectLoopSuite('desktop');
