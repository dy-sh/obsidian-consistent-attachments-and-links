# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The scope line — read this before adding any command

> Consistent Attachments and Links **reports** every link whose written path does not itself lead to its target — Obsidian's own resolver is deliberately more forgiving than that — and **repairs** names and paths that a platform the vault is synced to would reject. It does not rewrite links into a style, and it does not place attachments or manage folders; where those matter, it reports and leaves the change to the user.

Operationally: **report strictly, repair narrowly, never rewrite.** The rule separating the first two (owner, 2026-09-02): **repair what damages the vault as data; report what merely limits who can read it.** A name Windows reserves means the file cannot exist on a machine the vault syncs to, so the vault itself is damaged. A shortest-path link damages nothing — the vault is intact and only a non-Obsidian reader cannot follow it.

The three categories, and where the removed surfaces went:

- **Report, strictly** — bad links, bad embeds, bad frontmatter links, path compatibility, and attachments sitting outside their configured attachment folder.
- **Repair, narrowly** — `fix-incompatible-paths` only.
- **Never rewrite** — link style went to Better Markdown Links, attachment placement to Custom Attachment Location, folder cleanup to Advanced Rename and Delete Handler.

**Two paraphrases of this that are FALSE.** Both were proposed during the 2026-09-02 scope design and rejected against the code; do not re-derive them:

1. *"It resolves in Obsidian → tolerated."* No. `LinksHandler.isValidLink` never calls Obsidian's resolver — it builds the path literally and asks `getFileOrNull`, which does no extension inference, no vault-wide name search and no fuzzy match. `[[note]]` **is** reported even though Obsidian finds it. The reporting standard is deliberately *stricter* than Obsidian, not looser. Tolerating wikilinks and non-relative links means the plugin does not **convert** them; it does not mean they go unreported.
2. *"Repairs names that break Obsidian on some platform."* No. Obsidian runs fine; the platform's **filesystem** rejects the name. `src/path-compatibility.ts`'s header has the frame: *"A vault is synced, so the platform that matters is not necessarily the one running."*

## Rename and delete handling is NOT this plugin's — do not re-add a handler

Since **4.0.0** this plugin registers no `RenameDeleteHandlerComponent`. Advanced Rename and Delete Handler (`advanced-rename-and-delete-handler`) owns the implementation *and* its settings for the whole vault. Five plugins used to bundle a copy of the dev-utils handler; two handlers acting on one rename corrupt links and move attachments twice, and which copy won depended on Obsidian's load order, so vault behavior depended on version skew. That plugin's `src/conflicting-plugins.ts` refuses to run beside this one below `4.0.0`.

What lives here instead:

- `src/advanced-rename-and-delete-handler.ts` — that plugin's id and name, plus `MigratableSettings`: the values this plugin may hand over. Only that payload is declared here. The envelope carrying it — `migrateSettings`, who is proposing, whether it was applied — is dev-utils' `SettingsMigrationApi`, which both ends compile against, so that half can no longer drift silently. That plugin is an Obsidian plugin repo, not an npm package, and the authoritative copy of its contract is its own `src/plugin-api.ts`.
- The handover itself is dev-utils' `SettingsMigrationComponent`, constructed in `plugin.ts`; this plugin supplies only `getProposedSettings` and `retireProposedSettings`. **Two defects the sibling plugin shipped here first, both invisible to unit tests, and knowing them is what stops the next person hand-rolling a sixth copy:** never gate the component's setup on the pending value in `onload` (the settings component is a sibling still loading, so `settings` holds defaults and the migration is lost for good — the shared component wires both the API ref's `change` and the settings component's `loadSettings`, and re-reads inside the propose path); and use `editAndSave`, never `setProperty`, for the pending value, or an applied migration is offered forever.
- **A third defect, this plugin's own (issue #159): the parking must be one-shot by itself.** obsidian-dev-utils runs legacy converters on EVERY load, and `excludePaths`, `includePaths` and `treatAsAttachmentExtensions` are still declared, so they sit in every saved record. `parkRenameDeleteSettings` used to park them alone, which re-opened a retired offer on every start and wrote it back to `data.json`. It now proposes only when the record still carries one of the six dropped rename/delete keys — gone after the first save — and clears a saved proposal made of the three declared keys alone, which only the defect could have written. A handover whose every parked key has left `PluginSettings` is one-shot by construction; one that parks a still-declared key needs a signal like this.
- That plugin is a **declared dependency**, through `getPluginDependencies()` in `plugin.ts` — no longer the optional suggestion it was in 4.0.x. Until its API is published, `onloadImpl` does not run: no commands, no handlers, no settings tab of this plugin's own; the library shows a blocked tab and a notice that installs it in one click, and finishes the load the moment it arrives. Asking for it is harmless because its defaults do nothing until renames or deletions are turned on.

Consequences for the tests:

- **Every integration vault seeds it.** `scripts/helpers/advanced-rename-and-delete-handler-seed.ts` downloads the pinned RELEASE (cached under `.cache/`) and writes it into the vault with a `data.json` that leaves renames, attachment moves and deletions off. The desktop, Android and performance projects get it from `scripts/vitest-global-setup.ts`, wired in `scripts/vitest-config.ts`; the demo-vault project composes it into its own setup. No suite may disable or remove it: it outlives each file, and taking it away closes this plugin's gate for every later file in the run.
- **Unit tests publish a stand-in API.** `src/plugin.test.ts` publishes an empty API for it in `beforeEach`; without it nothing past the base loads. `unpublishProviderApi()` withdraws it to test the blocked path.

The `bulk-delete.desktop-performance.integration.test.ts` suite and its vault generator were deleted with the handler — they proved an O(N) cost that is no longer incurred here. The `integration-tests:desktop-performance` project stays (obsidian-dev-utils declares it for every project with `passWithNoTests`).

## Wikilink conversion is NOT this plugin's — do not re-add it, and do not re-add the report buckets

The original author built this plugin to **force a vault's migration to Markdown links**. That stopped being a requirement (owner, 2026-09-01), and the whole surface was removed: the four `Replace all wiki…` command handlers, `LinksHandler.replaceAllNoteWikilinksWithMarkdownLinks`, the first two steps of `reorganizeVault`, and the `Wiki links` / `Wiki embeds` buckets of the consistency report.

[Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns the conversion. It already reached further — one file, one folder or the whole vault, plus automatic modes — and gained a force-`LinkStyle.Markdown` mode specifically so nothing was lost in the move.

**The report buckets went deliberately, not by oversight.** Listing a wikilink under *inconsistencies* IS the forced-migration premise; keeping the audit while dropping the commands would have left the plugin reporting a defect it no longer offers to fix. The report's remaining sections — bad links, bad embeds, bad frontmatter links, path compatibility — are about links that do not resolve, which is a different claim.

What stays, and why it can look like a leftover:

- `treatAsAttachmentExtensions` / `isTreatedAsAttachment` are still honoured, now only by the misplaced-attachments report (`MisplacedAttachmentHandler.check`). See the link-path rewriting section below for what that does and does not mean for issue #151.
- `wikilink` stays in `cspell.json`. `06 Recommended Obsidian settings.md` is about *Obsidian's* wikilink setting, and the Excalidraw demo material still needs the word.

**Release ordering:** Better Markdown Links' force-Markdown mode was on its `main` but unreleased when this landed (its `5.0.0` predates it). Do not ship a release of this plugin carrying the removal until that plugin has published a version with the mode, or the capability is lost between releases rather than moved.

## Link-path rewriting is NOT this plugin's either — and issue #151 is now satisfied by construction

The four `Convert all … paths to relative` commands are gone, and with them `LinksHandler`'s whole rewriting half (`convertAllNoteRefPathsToRelative`, `convertLink`, and the notice and resource-lock dependencies that only `applyFileChanges` needed) and two more steps of `reorganizeVault`. `LinksHandler` is now `checkConsistency` + `isValidLink` + `ConsistencyCheckResult` — a reporter, nothing else.

This was a **scope removal, not a handover**: rewriting a link into a style is the "never rewrite" third of the scope line. Better Markdown Links is named in the README and demo vault as where link paths live, but nothing was waiting on it, so unlike the wikilink removal this carried no release gate of its own.

**Issue #151 is the trap here.** It says the plugin's link-rewriting operations must SKIP a file listed in `treatAsAttachmentExtensions`, so the image references Excalidraw stores inside a `.excalidraw.md` are never rewritten. `convertAllNoteRefPathsToRelative` was the last thing that honoured it, and it went. Attachment collecting then carried the guarantee alone — and was measured NOT to at first (it picked source notes with obsidian-dev-utils' plain `isNote`, so a drawing was scanned and rewritten), was fixed through an `isNoteEx` predicate, and then itself left for Custom Attachment Location in 5.0.0. The state now is:

- **Nothing here rewrites a link any more**, so #151 holds by construction rather than by a predicate: there is no choke point left to guard. `Fix incompatible paths` renames files through `renameSafe`, and the link updates that follow are Obsidian's own, which is outside #151's frame.
- **The report still reads a drawing, deliberately.** `checkConsistency` walks `getMarkdownFilesSorted` and reports a drawing's unresolvable links like any other file's. #151 forbids rewriting, not reporting, and "report strictly" is the first third of the scope line. Do not "fix" this by filtering the report.
- **Custom Attachment Location deliberately does NOT carry the collect-side skip.** Its own issues ship *running Collect on a drawing* as their defining scenario, and porting the skip failed exactly those suites, so a user who relied on this plugin's skip gets that plugin's behavior: a drawing IS collected from. That decision, and the one measurement that would reopen it (whether collecting from a plain note that shares a compressed drawing's image breaks the drawing), live with that plugin. Do not re-derive it from here.

The two Excalidraw collecting suites (`excalidraw-attachment-collecting` and `excalidraw-source-note-skip`) left with the collector.

Screenshots 1 and 2 moved onto path repair, which forced a per-platform offender: the capture host must be able to CREATE the offending name, so desktop stages an over-long-in-bytes name (legal on NTFS) and Android stages a reserved `CON` (legal on ext4). Both suites' headers carry the full reasoning, including which candidate characters Obsidian's own `vault.create` refuses on every platform.

## `Delete empty folders` is NOT this plugin's — do not re-add it, and `FilesHandler` is gone with it

The command, `ConsistentAttachmentsAndLinksComponent.deleteEmptyFolders`, its step in `reorganizeVault`, and the whole of `src/files-handler.ts` were removed. `deleteEmptyFolders` was that class's only method, so nothing was left to keep.

**Why it went, checked rather than assumed** (the owner asked outright what it had to do with consistency):

- **It read no link and no metadata cache.** It was a plain recursive filesystem walk — the one surface here that never touched a link.
- **It repaired something the report never named as a defect.** The report's sections are bad links, bad embeds, bad frontmatter links and path compatibility. An empty folder appears in none of them, so the plugin swept up debris it never claimed was debris.
- **Its automatic half had already left in 4.0.0**, where `deleteEmptyFolders` was migrated into Advanced Rename and Delete Handler's `emptyFolderBehavior`. Only the manual sweep stayed behind, which is the awkward half: the plugin cleaned up on command but not on rename.
- **The sweep existed to clean up after attachment MOVES**, immediately after `collectAttachmentsEntireVault` in `reorganizeVault` — and collecting itself has since left too. Its reason to exist went with it.

**This was a handover, and the receiving half shipped FIRST.** Advanced Rename and Delete Handler `1.3.0` carries the manual vault-wide command, deliberately under **the same id and the same name** — `advanced-rename-and-delete-handler:delete-empty-folders`, *Delete empty folders* — so a user's hotkey and command-palette habit survive the move. That is why every doc here points at it by name instead of simply dropping the capability, and it is a safe thing to promise: that plugin is a declared dependency, so a user running this one always has it. That plugin's `src/consistent-attachments-and-links.ts` knows which versions of this plugin overlap with it.

**The legacy settings path is NOT part of this and must keep working.** `LegacySettings.deleteEmptyFolders` in `plugin-settings-component.ts` — and the conversion mapping it onto `emptyFolderBehavior`, which `parkRenameDeleteSettings` hands across as `proposedRenameDeleteSettings` — is what carries a pre-4.0.0 user's choice to the plugin that owns it now. It reads the saved `data.json` record and never touched the command or `FilesHandler`, so the removal could not reach it, and it stays. Deleting that property because "the feature is gone" would strip the key from `data.json` on the first save and lose the migration for good — the reason the whole `LegacySettings` class exists is spelled out in its own comment.

`reorganizeVault` itself stays for now; retiring it is separate work.

## Attachment collecting is NOT this plugin's — do not re-add it

Since **5.0.0** the four collect and move commands (`Collect attachments in current note` / `… in current folder` / `… in entire vault`, and `Move attachment to proper folder`), the file-menu items, auto-collect on `metadataCache` `changed`, `reorganizeVault`'s collect step, `AttachmentCollector`, both collect modals and their i18n are gone. [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) (`obsidian-custom-attachment-location`) owns collecting for the whole vault. This plugin's copy was a fork kept "deliberately identical in behavior" to that plugin's, and a user with both installed got two sets of commands — which is what `shouldAddCommandsToFileMenu` existed to paper over. That plugin's `src/conflicting-plugins.ts` stands aside while this plugin is below `5.0.0`.

**It is a SUGGESTION, not a dependency** — the deliberate opposite of Advanced Rename and Delete Handler. obsidian-dev-utils' own rule for choosing: a dependency is for a plugin without which the host's advertised behavior is not there at all; a suggestion is for one that only takes over what the host no longer does. Everything left here (the report, the path repair) works without it. So:

- `PluginSuggestionComponent` in `plugin.ts`, with a banner row at the top of the settings tab (the same row shape 4.0.x used before that plugin became a dependency — Obsidian never calls `display()` once declarative definitions exist, so a row is the only host).
- **The load-time notice is asked only while a collect proposal is pending.** `isSuggestionDeclined` reads `isCustomAttachmentLocationSuggestionDeclined || proposedCollectSettings === null`, so a fresh 5.x install, which never collected here, is not nagged; the banner is always there until that plugin is enabled.

**The settings handover** is dev-utils' `SettingsMigrationComponent` a second time, at contract range `'^1.1.0'` (`migrateSettings` arrived in that plugin's contract `1.1.0`, first published in its 13.0.0). `src/custom-attachment-location.ts` declares the id, the name and the payload (`MigratableCollectSettings`) — declared, not imported, for the reason the rename/delete contract file gives; the authoritative copy is that plugin's `api.d.ts`.

- **Five keys are proposed, six left.** `shouldAddCommandsToFileMenu` is NOT proposed: that plugin always puts its collect and move items in the file menu, so it has no toggle for the value. It is not declared in `LegacySettings` at all: the rebuilt record drops an undeclared key on its own, so there is nothing to declare it for.
- **The collect parking is one-shot by construction; the rename/delete parking is not.** Every key `parkCollectSettings` reads has left `PluginSettings`, so the converter deletes it from the record and no later load can park it again. `parkRenameDeleteSettings` also reads `includePaths` / `excludePaths` / `treatAsAttachmentExtensions`, which stayed — so it re-parks them on every load: measured 2026-09-24, a retired rename/delete offer comes back on the next load as `{ excludePaths, includePaths, treatAsAttachmentExtensions }`. That is the likely cause of issue #159 (the migration popup returning on every startup), which is tracked and fixed separately. Do not copy that shape: never park a key that is still declared. `collect-migration.desktop.integration.test.ts` asserts a retired offer stays retired across a reload, and fails when parking is turned off.
- **A unit-test data handler must round-trip through JSON**, not `structuredClone`: the saved record carries a private settings field as an `undefined` key (an obsidian-dev-utils defect), which a real `data.json` drops and a clone keeps, and reloading that key throws inside the `excludePaths` setter.

What stays, and why it can look like a leftover:

- **The misplaced-attachments report** keeps "Attachments" in the plugin's name. It took over the two reads it needed from the deleted collector — `isAtProperAttachmentPath` and `getAttachmentFilePath({ shouldSkipDuplicateCheck: true })`, plus the `isNote && !isTreatedAsAttachment` predicate — so it still asks the same question that plugin's `Move attachment to proper folder` asks.
- **`treatAsAttachmentExtensions` stays**: the report reads it, and it is proposed to Advanced Rename and Delete Handler.
- **The backup warning stays, reworded.** Auto-collect was the last setting `revertDangerousSettings()` reverted, so that method, `hadDangerousSettingsReverted` and the tab's dangerous-setting alert are gone. The one-time warning now names what still changes a vault: `Fix incompatible paths` and `Reorganize vault` rename files.
- **`reorganizeVault` is now a single step** (`fixIncompatiblePaths`). Retiring it is separate work.
- **Screenshot frame 3 (the collect story) was dropped**, as the rename frame was before it; the report frame became frame 3 and now shows a misplaced attachment. Its subject note embeds `../attachments/diagram.png` — a path that resolves literally — because the old `attachments/diagram.png` only resolved after collecting rewrote it, and the report would call it a bad embed rather than a misplaced one.

## Path compatibility

`Fix incompatible paths` and the report's `Path compatibility` section repair names and paths that are invalid on a platform the vault is synced to. Two files, split on testability:

- `src/path-compatibility.ts` — pure, no `App`. The platform table, violation detection, and `repairName`. Every correctness question (byte counting, extension preservation, truncation order, profile composition) is answerable here with no Obsidian instance.
- `src/path-compatibility-handler.ts` — the vault pass, the report section, and the preservation writes.

Things that are easy to get wrong here, and were:

- **Rename through obsidian-dev-utils' `renameSafe`, never `app.vault.rename`.** `renameSafe` goes via `app.fileManager.renameFile`, so Obsidian rewrites every link and Advanced Rename and Delete Handler moves attachments. The reference implementation this came from (`F:\Obsidian\.scripts\src\Invocables\FixLongPaths.ts`) used `vault.rename` and silently broke links.
- **`renameSafe` can undo the repair.** Its `getSafeRenamePath` appends a space and a number on a collision, which can push the name back over the limit it was just brought under. `renameToName` re-checks the resolved path and retries with a shorter basename; it terminates because the fed-back basename strictly shrinks.
- **The Windows naming rules are `obsidian-dev-utils`' — do not re-derive them here.** `isWindowsReservedName`, `hasWindowsTrailingChars` and `trimWindowsTrailingChars` in `obsidian-dev-utils/obsidian/validation` own the reserved-device-name and trailing-character rules, beside the character sets that were already there. `isWindowsReservedName` trims trailing dots and spaces and drops the last extension itself, so a caller needs to know neither step. What stays local is the *profile guard* — whether Windows is one of the platforms this vault must satisfy — which is why `trimTrailingDotsAndSpaces` still exists as a thin profile-aware wrapper.
- **`repairName` passes the REBUILT name to `isWindowsReservedName`, never the bare basename.** Its `params.basename` has already had the extension split off, and the library drops one extension of its own, so the bare basename would strip a second segment and call `CON.x` + `md` reserved — contradicting the report, which accepts `CON.x.md`. Rebuilding makes both functions ask the identical question about the identical string. That sharing also **fixed** a divergence the two had carried: the report has always called a folder named `CON.x` reserved, while the repair left it alone.
- **Trim trailing dots and spaces BEFORE the de-reserving underscore.** The library trims for its own answer, so a trailing-space `CON` is reported reserved either way — but the underscore is appended to whatever the local basename holds, and leaving that space on de-reserves to `CON _` instead of `CON_`.
- **255 is BYTES on ext4/APFS and UTF-16 units on NTFS.** They are different limits in different units, which is why the settings are one toggle per platform rather than three numbers. Cut by code point, never by UTF-16 unit, or a surrogate pair splits.
- **The vault root is part of every path and is only knowable for the machine you are on.** Hence `maxVaultRootPathLength` (`0` = the real root) and a warning — never a silent clamp — when the real root exceeds it.
- **The sidecar follows the rename.** Renaming an attachment orphans the sidecar note that describes it, and that mismatch is ours to fix since the rename was ours. Keeping a bundle together in general is File Bundles' job, not this plugin's.
- **The rename is the repair's EARLIEST observable effect, not its last.** `renameToName` follows it with the sidecar move and then `preserveOriginalName`, which awaits an `addAlias` and a `processFrontmatter` write, and the metadata cache has to re-read the file on top of both. So anything observing the command from outside — an integration closure, a follow-on pass — that stops when the old path disappears is reading a write still in flight. Measured here at 1 run in 6: the alias had landed and the title had not, which is exactly how `path-compatibility.desktop.integration.test.ts` used to fail on `aliases` in one run and on `title` in the next. It now waits for the preserved values themselves, through the same function its assertions read them with.

Reserved-name detection (`CON`/`PRN`/`AUX`/`NUL`/`COM1`-`9`/`LPT1`-`9`) moved to `obsidian-dev-utils` and was consumed here on the `obsidian-dev-utils@99.0.0` bump. Two cases stay deliberately **unmatched** there, so do not "fix" them here either: `CONIN$` / `CONOUT$` and the superscript `COM²` forms, which every Windows version that runs Obsidian accepts — matching them would rename files that work.

## Misplaced attachments — the report's fifth section

`Misplaced attachments` names every reference that reaches an attachment sitting outside the attachment folder configured for the note that references it. It is the section that justifies "Attachments" staying in the plugin's name once collecting left for Custom Attachment Location (owner, 2026-09-02). **It only reports** — the first third of the scope line — and points the user at that plugin's `Move attachment to proper folder` and `Collect attachments`.

`src/misplaced-attachment-handler.ts` holds the judgement and the report shape; `LinksHandler` feeds it.

**The per-note seam is NOT the hard part, contrary to the obvious reading, and re-deriving that costs a sitting.** The fear was that `app.vault.getConfig('attachmentFolderPath')` is the only available read and that Custom Attachment Location patches it against the *currently open* file, so a vault-wide walk would give every note the active note's folder — wrongly, silently. Nothing here asks that way. obsidian-dev-utils' `getAttachmentFilePath` dispatches to **`app.vault.getAvailablePathForAttachments.extended`**, which takes `notePathOrFile` as an argument and so has no ambient state to leak, and falls back to Obsidian's own three modes when no plugin installed one. Two consequences worth writing down:

- **Do not reach for Custom Attachment Location's `CustomAttachmentLocationApi` here.** That registry API is for callers that need that plugin specifically. The extended function is the vault-wide seam every obsidian-dev-utils attachment helper honours, and it is what `move-attachment-to-proper-folder` resolves through — so asking any other way makes the report disagree with this plugin's own repair for the very finding it produces.
- **A cross-plugin proof needs no released Custom Attachment Location and no API stub.** The seam is a property on a function, so `misplaced-attachment-report.desktop.integration.test.ts` installs its own `extended` that answers a different folder per note and asserts the report names both. That phase is the falsifying test for the ambient-state failure above, and it runs with nothing installed.

Three decisions that look arbitrary and are not:

- **It judges the FOLDER, never the path.** obsidian-dev-utils' `getAttachmentFilePath` answers about the proper *path* — folder and templated base name both — so judging on it raw reports every attachment whose name does not match the rename template. This plugin does not rename attachments, and reporting what it does not offer to fix is precisely the mistake the wikilink buckets' removal settled. An attachment in the right folder under a "wrong" name is deliberately silent.
- **The folder comes from `parentFolderPath`, not `dirname`.** It answers `/` for the vault root where `dirname` answers `.`, and it is what obsidian-dev-utils' own `getAttachmentFolderPath` returns — so the folder this report names is byte-identical to the one that function gives for the same note. The comparison folds case when the data adapter is insensitive, matching `isAtProperAttachmentPath` rather than inventing a second standard.
- **A markdown file the user has declared an attachment (`isTreatedAsAttachment`, `.excalidraw.md` by default) IS judged.** The predicate is `isNote && !isTreatedAsAttachment`, which is the rule a collector uses to make such a file travel as an attachment. Answering differently would leave the report and the repair disagreeing about what an attachment is. This is orthogonal to issue #151, which forbids *rewriting* a drawing's contents, not reporting one.

**A reference is never reported twice, and that is structural rather than a filter.** `LinksHandler` resolves each reference exactly once through `resolveValidReferenceTarget` (the resolution half of what used to be `isValidLink`); a reference that resolves to nothing is added to its bad bucket and goes no further, and only the ones that resolved are offered to this check. Do not "restore" a second filter — the guarantee holds because there is one resolution, and a second one is what would let the two drift apart.

## Pinned versions

An **exact** version (no `^`) is how a dependency is held back here, and it is also what makes it invisible to `update-npm-deps.ps1`: that script upgrades caret ranges and *silently* skips exact pins. Nothing will ever remind you a pin is stale, so every exact pin carries a release condition — the package, the reason and the command that tests the condition — in [`pinned-versions.json`](pinned-versions.json). **A pin added without an entry there cannot be retired by anyone but its author — do not add one.**

Today that is one pin: `overrides.typescript` = `6.0.3`, held below TypeScript 7 because `@typescript-eslint`'s parser crashes on the tsgo native API, so type-aware ESLint cannot run on 7.

## Security overrides (`brace-expansion` GHSA-mh99-v99m-4gvg)

`brace-expansion` <= `5.0.7` is vulnerable; the fix ships **only** on the `5.x` line, while `minimatch@3` / `@5` / `@8` / `@9` pin the unpatched `1.x` / `2.x` lines. `npm audit fix` cannot resolve this — its only offer is a breaking downgrade of `obsidian-dev-utils` to `43.10.1` — so the `overrides` block carries the fix. Mirrors the same block in `obsidian-dev-utils`; keep the two in step.

| Override | Why |
| --- | --- |
| `glob` → `^13`, `readdir-glob` → `^3` | Newest majors, both on `minimatch@^10` (which uses the patched `brace-expansion@5`). They reach us through `obsidian-integration-testing` → `webdriverio` (`@wdio/config`, `archiver`/`archiver-utils`); the call sites are `glob.sync` / `import { sync as globSync }` and `readdir-glob`'s `match` / `end` events, all unchanged across the majors. |
| `eslint-plugin-n` → `^18`, `eslint-plugin-json-schema-validator` → `^6` | Replaces the versions `@microsoft/eslint-plugin-sdl` / `eslint-plugin-obsidianmd` pin exactly; `n@18` drops `minimatch` entirely and `json-schema-validator@6` moved to `minimatch@^10`. |
| `eslint-plugin-import` → `npm:eslint-plugin-import-x` | `eslint-plugin-import` still needs `minimatch@^3` at its latest version, and `import-x` is its maintained fork (already in the tree as a direct `obsidian-dev-utils` dependency). |
| `brace-expansion` → `file:patches/brace-expansion-callable` | Last resort for `eslint-plugin-react`, which `@microsoft/eslint-plugin-sdl` pins and which still needs `minimatch@3`. The `1.x` and `5.x` lines differ **only** in module shape (`module.exports = expand` vs `exports.expand`), so the patch re-exports the patched `5.x` implementation — installed under the `brace-expansion-upstream` alias — in the legacy callable shape. |

Keep the `brace-expansion` override **top-level**: pointed at a nested (scoped) key, npm resolves the `file:` spec relative to the *dependent* and produces a junction to a path that does not exist.

**Remove all of this** once upstream lands the backports — check with `npm view brace-expansion versions --json`: the legacy heads were `1.1.16` / `2.1.3` / `3.0.5` as of 2026-07-29, all still unpatched, so anything newer on those lines means the backport landed and the patch plus the `brace-expansion-upstream` alias become dead weight. The `eslint-plugin-import` → `import-x` alias is separate and does **not** retire with it — that one lasts as long as `eslint-plugin-import` needs `minimatch@^3`.

## Security overrides (`extract-zip` GHSA-jmr9-qjv8-65gv)

`extract-zip` is vulnerable at **every** published version — the advisory range is `*` and `2.0.1` is the newest release — so there is nothing to override it *to*. It arrives here through

```text
obsidian-dev-utils → obsidian-integration-testing → webdriverio → @wdio/utils → @puppeteer/browsers@2.x → extract-zip
```

and no upgrade reaches it: even the newest `@wdio/utils` still declares `@puppeteer/browsers: ^2.2.0`. The fix therefore goes one level up — `overrides.@puppeteer/browsers` → `^3.2.0`, whose `3.x` line replaced `extract-zip` with `modern-tar`. That drops the vulnerable subtree entirely and **dedupes**: `puppeteer-core` already pulls `3.2.0` into this tree. The major bump is safe because `@wdio/utils` imports only `install`, `canDownload`, `resolveBuildId`, `detectBrowserPlatform`, `Browser`, `ChromeReleaseChannel` and `computeExecutablePath`, all still exported by `3.x`.

**Never take `npm audit fix --force` here** — its remedy downgrades `obsidian-integration-testing` from `10.x` to `1.1.2`. **Remove the override** when `@wdio/utils` moves to `@puppeteer/browsers@^3` itself; the `check` in [`pinned-versions.json`](pinned-versions.json) watches exactly that. Mirrors the same override in `obsidian-dev-utils`; keep the two in step.
