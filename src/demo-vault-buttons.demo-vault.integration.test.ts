import { registerDemoVaultButtonSuite } from 'obsidian-dev-utils/script-utils/demo-vault-buttons';

// Clicks every `code-button` in `demo-vault/` against a real Obsidian.
// A button's failure happens at click time — a wrong `require('/demoSetup.ts')` path, or an API that
// Changed shape under it — so no other gate in this repo can catch it.
// `lint:md` reads the markdown and the coverage suite checks the authoring conventions, and neither
// Executes anything.
//
// Isolation: `npx vitest run --project integration-tests:demo-vault`.
registerDemoVaultButtonSuite();
