# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

## Direction: stay Advanced-Exclude-agnostic; fix the root cause in dev-utils

This plugin must NOT couple to Advanced Exclude — no `app.advancedExclude`, no "bulk in
progress" signal handshake. (A prototype gating the settings builder's `isPathIgnored` on
`app.advancedExclude.isApplyingProjection` was committed then reverted precisely to keep the
plugin agnostic.)

The bulk-deletion freeze was caused by the dev-utils delete handler acting on **index-only
removals** — a synthetic `vault.on('delete')` where the file still exists on disk (e.g. when a
folder is hidden). The agnostic fix skips the handler when `await app.vault.adapter.exists(path)`
is true; because it is async it lives in dev-utils' `RenameDeleteHandler`, not this plugin's sync
`isPathIgnored`. It ships in `obsidian-dev-utils` `>= 80.1.0` and requires no plugin code change.

## Integration tests

`src/bulk-delete.desktop-performance.integration.test.ts` (vitest project
`integration-tests:desktop-performance`, run via `npm run test:integration:desktop:performance`)
guards the fix:

- **O(N) reproduction**: a bulk **real** deletion (`trashFile`) of N notes resolves the
  attachment path exactly once per note — and zero times with the plugin disabled. Real
  deletions are inherently O(N); the fix does not (and must not) change this.
- **Index-only-removal skip**: firing one `vault.on('delete')` per note **without** removing it
  from disk must resolve **zero** attachment paths, because the disk-existence guard skips every
  synthetic removal. A single real deletion enqueued last is the FIFO drain marker proving the
  synthetic handlers actually ran.

> The integration test runs the built bundle `dist/build`, not `node_modules`. After any
> `obsidian-dev-utils` upgrade, run `npm run build` first or the test silently exercises the
> stale pre-upgrade bundle.

## Pinned versions

An **exact** version (no `^`) is how a dependency is held back here, and it is also what makes it invisible
to `update-npm-deps.ps1`: that script upgrades caret ranges and *silently* skips exact pins. Nothing will
ever remind you a pin is stale, so every exact pin carries a release condition — the package, the reason
and the command that tests the condition — in [`pinned-versions.json`](pinned-versions.json). **A pin added
without an entry there cannot be retired by anyone but its author — do not add one.**

Today that is one pin: `overrides.typescript` = `6.0.3`, held below TypeScript 7 because
`@typescript-eslint`'s parser crashes on the tsgo native API, so type-aware ESLint cannot run on 7.

## Security overrides (`brace-expansion` GHSA-mh99-v99m-4gvg)

`brace-expansion` <= `5.0.7` is vulnerable; the fix ships **only** on the `5.x` line, while `minimatch@3`
/ `@5` / `@8` / `@9` pin the unpatched `1.x` / `2.x` lines. `npm audit fix` cannot resolve this — its only
offer is a breaking downgrade of `obsidian-dev-utils` to `43.10.1` — so the `overrides` block carries the
fix. Mirrors the same block in `obsidian-dev-utils`; keep the two in step.

| Override | Why |
| --- | --- |
| `glob` → `^13`, `readdir-glob` → `^3` | Newest majors, both on `minimatch@^10` (which uses the patched `brace-expansion@5`). They reach us through `obsidian-integration-testing` → `webdriverio` (`@wdio/config`, `archiver`/`archiver-utils`); the call sites are `glob.sync` / `import { sync as globSync }` and `readdir-glob`'s `match` / `end` events, all unchanged across the majors. |
| `eslint-plugin-n` → `^18`, `eslint-plugin-json-schema-validator` → `^6` | Replaces the versions `@microsoft/eslint-plugin-sdl` / `eslint-plugin-obsidianmd` pin exactly; `n@18` drops `minimatch` entirely and `json-schema-validator@6` moved to `minimatch@^10`. |
| `eslint-plugin-import` → `npm:eslint-plugin-import-x` | `eslint-plugin-import` still needs `minimatch@^3` at its latest version, and `import-x` is its maintained fork (already in the tree as a direct `obsidian-dev-utils` dependency). |
| `brace-expansion` → `file:patches/brace-expansion-callable` | Last resort for `eslint-plugin-react`, which `@microsoft/eslint-plugin-sdl` pins and which still needs `minimatch@3`. The `1.x` and `5.x` lines differ **only** in module shape (`module.exports = expand` vs `exports.expand`), so the patch re-exports the patched `5.x` implementation — installed under the `brace-expansion-upstream` alias — in the legacy callable shape. |

Keep the `brace-expansion` override **top-level**: pointed at a nested (scoped) key, npm resolves the
`file:` spec relative to the *dependent* and produces a junction to a path that does not exist.

**Remove all of this** once upstream lands the backports — check with
`npm view brace-expansion versions --json`: the legacy heads were `1.1.16` / `2.1.3` / `3.0.5` as of
2026-07-29, all still unpatched, so anything newer on those lines means the backport landed and the patch
plus the `brace-expansion-upstream` alias become dead weight. The `eslint-plugin-import` → `import-x` alias
is separate and does **not** retire with it — that one lasts as long as `eslint-plugin-import` needs
`minimatch@^3`.

## Security overrides (`extract-zip` GHSA-jmr9-qjv8-65gv)

`extract-zip` is vulnerable at **every** published version — the advisory range is `*` and `2.0.1` is the
newest release — so there is nothing to override it *to*. It arrives here through

```text
obsidian-dev-utils → obsidian-integration-testing → webdriverio → @wdio/utils → @puppeteer/browsers@2.x → extract-zip
```

and no upgrade reaches it: even the newest `@wdio/utils` still declares `@puppeteer/browsers: ^2.2.0`. The
fix therefore goes one level up — `overrides.@puppeteer/browsers` → `^3.2.0`, whose `3.x` line replaced
`extract-zip` with `modern-tar`. That drops the vulnerable subtree entirely and **dedupes**: `puppeteer-core`
already pulls `3.2.0` into this tree. The major bump is safe because `@wdio/utils` imports only `install`,
`canDownload`, `resolveBuildId`, `detectBrowserPlatform`, `Browser`, `ChromeReleaseChannel` and
`computeExecutablePath`, all still exported by `3.x`.

**Never take `npm audit fix --force` here** — its remedy downgrades `obsidian-integration-testing` from
`10.x` to `1.1.2` (G100). **Remove the override** when `@wdio/utils` moves to `@puppeteer/browsers@^3`
itself; the `check` in [`pinned-versions.json`](pinned-versions.json) watches exactly that. Mirrors the same
override in `obsidian-dev-utils`; keep the two in step.
