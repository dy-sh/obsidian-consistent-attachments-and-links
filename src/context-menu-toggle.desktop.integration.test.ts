import { registerContextMenuToggleSuite } from './context-menu-toggle-shared.integration.test.ts';

// Desktop-only: no Android emulator is available in this environment. The `file-menu` command-toggle
// Flow is platform-agnostic (the setting gates the same registered menu handlers on both platforms),
// So an Android entry point can call the same shared suite later (G97 escape hatch).
registerContextMenuToggleSuite('desktop');
