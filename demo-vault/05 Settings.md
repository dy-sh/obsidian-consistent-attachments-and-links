# Settings

Open **Settings -> Community plugins -> `Consistent Attachments and Links`** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

> [!WARNING]
>
> **Fix Incompatible Paths** renames files across the vault, and the settings below decide what it renames. The plugin shows a one-time backup warning about it. Back up a real vault before running it.

## What happens when notes move, rename, or delete

Nothing here — since 4.0.0 those settings belong to [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler), which owns rename and delete handling for the whole vault. Its settings tab is where **Should handle renames**, **Should handle deletions**, **Should rename attachment folder**, **Should update file name aliases**, **Should delete conflicting attachments** and **Empty folder behavior** live now.

This plugin needs that plugin, and does nothing without it: while it is missing or disabled, this plugin loads nothing, says why in a notice and in its settings tab, and installs it in one click. It finishes loading the moment the other plugin appears, with no restart. Installing it changes nothing on its own — its defaults do nothing until you turn renames or deletions on. This vault installs it for you on first open.

Upgrading from 3.x does not lose your answers: this plugin offers them to that plugin once, the first time both are installed, and shows you exactly what would change before anything is written. One bookkeeping key tracks that hand-over, and it has no row in the settings tab:

- `proposedRenameDeleteSettings`
  - the rename and delete values you had in 3.x, waiting to be offered. `null` once the migration has been applied - or from the start, on a fresh install that never had any. Cancelling the offer leaves them here, so it comes back next time.

## Collecting attachments

Nothing here either — since 5.0.0 collecting attachments belongs to [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location), which owns **Collect attachments**, **Move attachment to proper folder** and collecting as you edit. Its settings tab is where **Collect attachments automatically**, **Collect attachment used by multiple notes mode**, **Move attachment to proper folder used by multiple notes mode**, **Exclude paths from attachment collecting** and **Attachment unit folders** live now.

Unlike `Advanced Rename and Delete Handler`, this plugin does not require it: the report and the path repair work without it. It is suggested instead, by a banner at the top of this plugin's settings tab and, if you had collect settings to hand over, a notice on load that installs it in one click.

Upgrading from 4.x does not lose your collect settings: they are offered to that plugin once, the first time both are installed, the same way the rename and delete settings are. **Add commands to file menu** is not among them - that plugin always puts its collect and move commands in the file menu, so there is nothing for the value to land in. Two bookkeeping keys track this, and neither has a row in the settings tab:

- `proposedCollectSettings`
  - the collect values you had in 4.x, waiting to be offered. `null` once the migration has been applied - or from the start, on a fresh install that never had any. Cancelling the offer leaves them here, so it comes back next time.
- `isCustomAttachmentLocationSuggestionDeclined`
  - whether you declined the notice suggesting that plugin. The settings-tab banner is shown regardless, since opening this tab is a fresher answer than one you gave earlier.

## Scope: which paths the plugin acts on

- `includePaths`
  - restrict the plugin's consistency handling to these paths (empty means the whole vault).
- `excludePaths`
  - paths the plugin ignores entirely.

An entry in either list, and in `pathCompatibilityExcludePaths` and `sharedAttachmentPaths` below, is one of three forms, and every form matches case-insensitively:

- a plain path, such as `Archive`, which covers that file or folder and everything under it.
- a glob, such as `*.pdf`, `Attachments/**/*.png` or `tmp*/`. `*` stays within one folder, `**` crosses folders, `?` is one character and `[abc]` / `[!abc]` a character class. A glob with no `/` matches a name at any depth, one with a `/` starts at the vault root, and a trailing `/` matches folders only.
- a regular expression written `/pattern/flags`, whose flags are honoured.

An unescaped `*`, `?` or `[` makes an entry a glob, so a path that holds one literally escapes it, as in `Notes \[old]`.

## Keeping paths valid on every platform

Walked through in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>). Each platform is a separate toggle because their limits are not comparable - only Windows has a path budget a vault runs into, and only Linux and Android count a name in bytes.

- `shouldEnsurePathCompatibilityOnEveryPlatform`
  - enforce every platform's rules at once, whatever the individual toggles say.
- `shouldEnsurePathCompatibilityOnWindows`
  - paths of at most 259 characters for a file and 247 for a folder, no reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`), no `<>:"|?*`, and no trailing dot or space. On by default when you are running on Windows.
- `shouldEnsurePathCompatibilityOnAndroid`
  - names of at most 255 **bytes**. On by default when you are running on Android.
- `shouldEnsurePathCompatibilityOnLinux`
  - names of at most 255 bytes.
- `shouldEnsurePathCompatibilityOnMacOs`
  - names of at most 255 bytes, and paths of at most 1024.
- `shouldEnsurePathCompatibilityOnIos`
  - names of at most 255 bytes, and paths of at most 1024.
- `shouldNormalizeUnicodeNames` (**Normalize Unicode names to NFC**)
  - report every name stored on disk in decomposed Unicode form (NFD), such as `й` stored as `и` plus a combining breve, and let **Fix Incompatible Paths** store it in the composed form (NFC) Obsidian uses. Independent of the platform toggles, and on by default: Obsidian never creates such a name, and sync, git and backup tools see the two forms as two different names. The name keeps every letter, so no link changes and nothing needs preserving. A name whose NFC spelling is already taken by a separate item on disk is skipped and listed, never overwritten.
- `pathCompatibilityExcludePaths` (**Keep names unchanged in these paths**)
  - paths whose names the path compatibility check leaves as they are: it neither reports them nor renames them with **Fix Incompatible Paths**, while their links are still checked. Meant for names another tool owns, such as a Calibre library, whose database holds every path in it. Empty by default. `excludePaths` would leave such a folder out of every check, and `sharedAttachmentPaths` does not touch this check at all.
- `maxVaultRootPathLength`
  - the length, in characters, of the longest vault root path this vault is expected to live under. `0` means this machine's real vault root, which makes the check exact here; set it to the length of the deepest place the vault is synced to when that is longer. A value below the real root's length is reported as a warning rather than quietly applied.
- `forbiddenCharacterReplacement` (**Forbidden character replacement**)
  - what **Fix Incompatible Paths** replaces each forbidden character with, one replacement per character. `-` by default, as in every earlier version; set `_` or anything else a file name can hold on every platform, or leave it empty to delete the character.
- `shouldAddOriginalNameAsAlias` (**Add the original name as an alias**)
  - add a renamed item's original name to the `aliases` of the note that describes it. On by default. The original name also goes to `title` when the note has none, and a `title` the note already has is never changed, so a vault that keeps each note's true name in `title` can turn this off and get no alias repeating it.
- `sidecarNoteNamePattern`
  - names the sidecar note that carries a renamed attachment's original name. Tokens: `{{fileName}}`, `{{basename}}`, `{{extension}}`. The default `{{fileName}}.md` makes `diagram.png` answer `diagram.png.md`, which cannot collide with a real note the way `{{basename}}.md` can.
- `shouldCreateNoteToPreserveOriginalName`
  - create a note to hold the original name when the renamed item has none - a folder with no folder note, an attachment with no sidecar. Off by default, in which case those are simply listed in the consistency report and nothing new appears on disk.

## Reports, folders, and safety

- `consistencyReportFile`
  - path of the note generated by **Check Vault Consistency** (default `consistency-report.md`).
- `externalAttachmentLinkMode` (**Links to attachments outside the note's folder**)
  - what the report does when a note links an attachment outside its own attachment folder. `Report` (default) lists every such link, even when the attachment sits in the folder of another note that uses it too, and names that note as its proper note. `ReportUnowned` lists it only when no note that uses the attachment has it in its own folder - the behavior of 5.0.2. `Ignore` switches the **Misplaced attachments** section off. Walked through in [03 Check vault consistency](<./03 Check vault consistency.md>).
- `sharedAttachmentPaths` (**Shared attachment locations**)
  - folders any note may take attachments from, one per line, such as `_assets/common`. A folder covers everything under it, and a glob or a `/regular expression/flags` works too, as in `excludePaths`. A link into one of them is never listed under **Misplaced attachments**.
- `treatAsAttachmentExtensions`
  - extensions that should be treated as attachments even though they are Markdown, such as `.excalidraw.md`. The **Misplaced attachments** section of the report judges a file listed here like any other attachment, instead of skipping it as a note - which is what a drawing wants, since it belongs to whatever note embeds it. The plugin never rewrites what is written inside such a file. Walked through in [03 Check vault consistency](<./03 Check vault consistency.md>).

## Fixing broken links

- `folderNoteFileNames` (**Folder note file names**)
  - the file names your folder notes are stored under, one per line, such as `index.md`. **Fix broken links** then recognizes a moved folder note by its folder's name too, and looks for the folder's old name in aliases. Empty by default. Walked through in [09 Fix broken links](<./09 Fix broken links.md>).
- `shouldUseGitHistoryForBrokenLinks` (**Use git history to find renamed targets**)
  - when the vault is in a git repository, read the renames in its history to find where a missing target went. On by default; desktop only.

## Safety

- `shouldShowBackupWarning`
  - show the one-time backup warning about the commands that rename files. It turns itself off once you have seen it.
- `shouldCommitBulkOperations` (**Commit bulk operations to git**)
  - when the vault is in a git repository, commit each run of **Fix Incompatible Paths** and each **Fix** / **Fix all like this** click of **Fix broken links** on its own: first `chore: before OP<n>` with whatever was already pending, then `OP<n>: <summary>` with exactly what the run changed. `git revert` of that commit, or the **Undo a bulk operation...** command, undoes the run. Off by default; desktop only.

Change any of these, then work through [03 Check vault consistency](<./03 Check vault consistency.md>) and [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>) to watch them take effect.
