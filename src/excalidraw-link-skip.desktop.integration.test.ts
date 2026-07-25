import { registerExcalidrawLinkSkipSuite } from './excalidraw-link-skip-shared.integration.test.ts';

// Desktop-only: no Android emulator is available in this environment. The link-rewriting skip is
// Platform-agnostic (the `treatAsAttachmentExtensions` guard lives in the shared LinksHandler, hit by
// Every entry point on both platforms), so an Android entry point can call the same suite later
// (G97 escape hatch).
registerExcalidrawLinkSkipSuite('desktop');
