# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

## The scope line — read this before adding any command (T891)

> Consistent Attachments and Links **reports** every link whose written path does not itself lead to its
> target — Obsidian's own resolver is deliberately more forgiving than that — and **repairs** names and
> paths that a platform the vault is synced to would reject. It does not rewrite links into a style, and it
> does not place attachments or manage folders; where those matter, it reports and leaves the change to the
> user.

Operationally: **report strictly, repair narrowly, never rewrite.** The rule separating the first two
(owner, 2026-09-02): **repair what damages the vault as data; report what merely limits who can read it.** A
name Windows reserves means the file cannot exist on a machine the vault syncs to, so the vault itself is
damaged. A shortest-path link damages nothing — the vault is intact and only a non-Obsidian reader cannot
follow it.

The three categories, and where the removed surfaces went:

- **Report, strictly** — bad links, bad embeds, bad frontmatter links, path compatibility, and
  attachments sitting outside their configured attachment folder.
- **Repair, narrowly** — `fix-incompatible-paths` only.
- **Never rewrite** — link style went to Better Markdown Links, attachment placement to Custom Attachment
  Location, folder cleanup to Advanced Rename and Delete Handler.

**Two paraphrases of this that are FALSE.** Both were proposed during the 2026-09-02 scope design and
rejected against the code; do not re-derive them:

1. *"It resolves in Obsidian → tolerated."* No. `LinksHandler.isValidLink` never calls Obsidian's resolver —
   it builds the path literally and asks `getFileOrNull`, which does no extension inference, no vault-wide
   name search and no fuzzy match. `[[note]]` **is** reported even though Obsidian finds it. The reporting
   standard is deliberately *stricter* than Obsidian, not looser. Tolerating wikilinks and non-relative
   links means the plugin does not **convert** them; it does not mean they go unreported.
2. *"Repairs names that break Obsidian on some platform."* No. Obsidian runs fine; the platform's
   **filesystem** rejects the name. `src/path-compatibility.ts`'s header has the frame: *"A vault is synced,
   so the platform that matters is not necessarily the one running."*

## Rename and delete handling is NOT this plugin's — do not re-add a handler

Since **4.0.0** this plugin registers no `RenameDeleteHandlerComponent`. Advanced Rename and Delete Handler
(`advanced-rename-and-delete-handler`) owns the implementation *and* its settings for the whole vault. Five
plugins used to bundle a copy of the dev-utils handler; two handlers acting on one rename corrupt links and
move attachments twice, and which copy won depended on Obsidian's load order, so vault behavior depended on
version skew. That plugin's `src/conflicting-plugins.ts` refuses to run beside this one below `4.0.0`.

What lives here instead:

- `src/advanced-rename-and-delete-handler.ts` — that plugin's id, name, and the shape of its public API as
  this plugin compiles against it. It is an Obsidian plugin repo, not an npm package, so the contract is
  declared rather than imported; the authoritative copy is its own `src/plugin-api.ts`.
- `src/rename-delete-handler-migration-component.ts` — offers the user's old values through that plugin's
  `migrateSettings` API, once. **Two defects T711-P18 shipped here first, both invisible to unit tests:**
  never gate the component's setup on the pending value in `onload` (the settings component is a sibling
  still loading, so `settings` holds defaults and the migration is lost for good — wire both the API ref's
  `change` and the settings component's `loadSettings`, and re-read inside the propose path); and use
  `editAndSave`, never `setProperty`, for both the declined flag and the pending value, or a decline returns
  on the next reload and an applied migration is offered forever.
- The suggestion banner travels as a settings **row**: Obsidian never calls `display()` once
  `getSettingDefinitions()` is non-empty.

The `bulk-delete.desktop-performance.integration.test.ts` suite and its vault generator were deleted with the
handler — they proved an O(N) cost that is no longer incurred here. The `integration-tests:desktop-performance`
project stays (obsidian-dev-utils declares it fleet-wide with `passWithNoTests`).

## Wikilink conversion is NOT this plugin's — do not re-add it, and do not re-add the report buckets

The original author built this plugin to **force a vault's migration to Markdown links**. That stopped being
a requirement (owner, 2026-09-01), and T846 removed the whole surface: the four `Replace all wiki…` command
handlers, `LinksHandler.replaceAllNoteWikilinksWithMarkdownLinks`, the first two steps of `reorganizeVault`,
and the `Wiki links` / `Wiki embeds` buckets of the consistency report.

[Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns the conversion. It
already reached further — one file, one folder or the whole vault, plus automatic modes — and gained a
force-`LinkStyle.Markdown` mode (T845-P14) specifically so nothing was lost in the move.

**The report buckets went deliberately, not by oversight.** Listing a wikilink under *inconsistencies* IS the
forced-migration premise; keeping the audit while dropping the commands would have left the plugin reporting
a defect it no longer offers to fix. The report's remaining sections — bad links, bad embeds, bad frontmatter
links, path compatibility — are about links that do not resolve, which is a different claim.

What stays, and why it can look like a leftover:

- `treatAsAttachmentExtensions` / `isTreatedAsAttachment` are still honoured, now only by
  `AttachmentCollector.isNoteEx`. See the T912 section below for what that does and does not mean for
  issue #151 — the answer changed, and the old one is still the intuitive one.
- `wikilink` stays in `cspell.json`. `06 Recommended Obsidian settings.md` is about *Obsidian's* wikilink
  setting, and the Excalidraw demo material still needs the word.

**Release ordering:** Better Markdown Links' force-Markdown mode was on its `main` but unreleased when this
landed (its `5.0.0` predates it). Do not ship a release of this plugin carrying the removal until that
plugin has published a version with the mode, or the capability is lost between releases rather than moved.

## Link-path rewriting is NOT this plugin's either — and issue #151 no longer means what it says (T912)

T912 removed the four `Convert all … paths to relative` commands, `LinksHandler`'s whole rewriting half
(`convertAllNoteRefPathsToRelative`, `convertLink`, and with them the notice and resource-lock dependencies
that only `applyFileChanges` needed), and two more steps of `reorganizeVault`. `LinksHandler` is now
`checkConsistency` + `isValidLink` + `ConsistencyCheckResult` — a reporter, nothing else.

This was a **scope removal, not a handover**: rewriting a link into a style is the "never rewrite" third of
the scope line. Better Markdown Links is named in the README and demo vault as where link paths live, but
nothing was waiting on it, so unlike T846 this carried no release gate of its own.

**Issue #151 is the trap here.** It says the plugin's link-rewriting operations must SKIP a file listed in
`treatAsAttachmentExtensions`, so the image references Excalidraw stores inside a `.excalidraw.md` are never
rewritten. `convertAllNoteRefPathsToRelative` was the last thing that honoured it, and it is gone. The
obvious assumption — that attachment collecting inherited the guarantee — is **false, and was measured**:

- `AttachmentCollector.collectAttachmentsInAbstractFilesImpl` selects notes with obsidian-dev-utils' plain
  `isNote` (`isMarkdownFile || isCanvasFile || isBaseFile`), which never consults the setting. So a
  `.excalidraw.md` is scanned as an ordinary note and its references ARE rewritten. Tracked as **T919-P22**;
  do not fix it here without reading that item, since collecting itself leaves under T901.
- `isNoteEx` — the predicate that DOES consult the setting — is called in exactly one place,
  `prepareAttachmentToMove`, where it decides whether a link's TARGET is a note. That is the opposite
  direction, and it is what makes a referenced `.excalidraw.md` travel as an attachment.

So `excalidraw-link-skip.desktop.integration.test.ts` was replaced by
`excalidraw-attachment-collecting.desktop.integration.test.ts`, which covers the second bullet with a
control phase, and says in its own header that it does not cover the first. The demo vault's Excalidraw
walkthrough was reframed the same way. **Do not restore the "left untouched" wording anywhere** — it
described a guarantee the code no longer makes.

Screenshots 1 and 2 moved onto path repair, which forced a per-platform offender: the capture host must be
able to CREATE the offending name, so desktop stages an over-long-in-bytes name (legal on NTFS) and Android
stages a reserved `CON` (legal on ext4). Both suites' headers carry the full reasoning, including which
candidate characters Obsidian's own `vault.create` refuses on every platform.

## Path compatibility (T698)

`Fix incompatible paths` and the report's `Path compatibility` section repair names and paths that are
invalid on a platform the vault is synced to. Two files, split on testability:

- `src/path-compatibility.ts` — pure, no `App`. The platform table, violation detection, and `repairName`.
  Every correctness question (byte counting, extension preservation, truncation order, profile composition)
  is answerable here with no Obsidian instance.
- `src/path-compatibility-handler.ts` — the vault pass, the report section, and the preservation writes.

Things that are easy to get wrong here, and were:

- **Rename through ODU's `renameSafe`, never `app.vault.rename`.** `renameSafe` goes via
  `app.fileManager.renameFile`, so Obsidian rewrites every link and Advanced Rename and Delete Handler moves
  attachments. The reference implementation this came from
  (`F:\Obsidian\.scripts\src\Invocables\FixLongPaths.ts`) used `vault.rename` and silently broke links.
- **`renameSafe` can undo the repair.** Its `getSafeRenamePath` appends a space and a number on a collision,
  which can push the name back over the limit it was just brought under. `renameToName` re-checks the resolved path and
  retries with a shorter basename; it terminates because the fed-back basename strictly shrinks.
- **Trim trailing dots and spaces BEFORE the reserved-name test.** Windows strips them before deciding, so
  a trailing-space `CON` is as reserved as a bare `CON`. Testing the raw name lets that spelling through, and trimming afterwards
  turns an accepted name into a rejected one.
- **255 is BYTES on ext4/APFS and UTF-16 units on NTFS.** They are different limits in different units, which
  is why the settings are one toggle per platform rather than three numbers. Cut by code point, never by
  UTF-16 unit, or a surrogate pair splits.
- **The vault root is part of every path and is only knowable for the machine you are on.** Hence
  `maxVaultRootPathLength` (`0` = the real root) and a warning — never a silent clamp — when the real root
  exceeds it.
- **The sidecar follows the rename.** Renaming an attachment orphans the sidecar note that describes it, and
  that mismatch is ours to fix since the rename was ours. Keeping a bundle together in general is
  File Bundles' job (P48), not this plugin's.

Reserved-name detection (`CON`/`PRN`/`AUX`/`NUL`/`COM1`-`9`/`LPT1`-`9`) is plugin-local only because ODU does
not own it yet; the character sets beside it (`WINDOWS_UNSAFE_PATH_CHARS` and friends) already do. T886-P1
moves it there.

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
