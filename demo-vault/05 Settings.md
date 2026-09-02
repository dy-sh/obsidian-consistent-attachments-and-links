# Settings

Open **Settings -> Community plugins -> Consistent Attachments and Links** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

> [!WARNING]
>
> Some of these settings change files on disk. The plugin shows a backup warning and, until you acknowledge it, keeps the most destructive option disabled. Back up a real vault before turning it on.

## What happens when notes move, rename, or delete

Nothing here — since 4.0.0 those settings belong to [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler), which owns rename and delete handling for the whole vault. Its settings tab is where **Should handle renames**, **Should handle deletions**, **Should rename attachment folder**, **Should update file name aliases**, **Should delete conflicting attachments** and **Empty folder behavior** live now.

Upgrading from 3.x does not lose your answers: this plugin offers them to that plugin once, the first time both are installed, and shows you exactly what would change before anything is written. Two bookkeeping keys track that hand-over, and neither has a row in the settings tab:

- `proposedRenameDeleteSettings`
  - the rename and delete values you had in 3.x, waiting to be offered. `null` once the migration has been applied - or from the start, on a fresh install that never had any. Cancelling the offer leaves them here, so it comes back next time.
- `isAdvancedRenameAndDeleteHandlerSuggestionDeclined`
  - whether you have dismissed the suggestion to install that plugin. It silences the notice only; the banner at the top of the settings tab stays, because opening that tab is a fresher signal than an answer you gave earlier.

## Collecting attachments as you edit

- `shouldCollectAttachmentsAutomatically`
  - collect a note's attachments into its folder automatically as you edit, without running a command.

## Attachment collecting and moving

- `collectAttachmentUsedByMultipleNotesMode`
  - what to do when a collected attachment is used by several notes: `Skip`, `Copy`, `Move`, `Cancel`, or `Prompt`.
- `moveAttachmentToProperFolderUsedByMultipleNotesMode`
  - the same choice for the **Move Attachment to Proper Folder** command: `Skip`, `CopyAll`, `Cancel`, or `Prompt`.
- `excludePathsFromAttachmentCollecting`
  - vault paths that attachment-collecting commands must leave untouched.
- `attachmentUnitFolderPaths`
  - folders whose whole hierarchy counts as **one** attachment, so collecting anything inside one moves the entire folder rather than tearing a single file out of it - the shape a saved web page or an Excalidraw export needs to keep working. The folder lands in the note's attachment folder under its own name, so the links inside it stay valid. Uses the same vocabulary as the include/exclude path settings: a plain entry is a path from the vault root, and an entry wrapped in `/` is a regular expression - so matching a folder *name* wherever it appears needs the regular-expression form, such as `/(^|\/)[^/]+_files(\/|$)/`. An attachment inside such a folder that several notes reference is skipped rather than copied, because copying the lone file back out would recreate exactly the breakage the designation prevents.
- `shouldAddCommandsToFileMenu`
  - add the **Collect attachments** and **Move attachment to proper folder** commands to the file and folder context menu (default on). Turn it off to avoid duplicate menu items when another plugin (such as **Custom Attachment Location**) offers the same commands; the commands stay available in the command palette.

## Scope: which paths the plugin acts on

- `includePaths`
  - restrict the plugin's consistency handling to these paths (empty means the whole vault).
- `excludePaths`
  - paths the plugin ignores entirely.

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
- `maxVaultRootPathLength`
  - the length, in characters, of the longest vault root path this vault is expected to live under. `0` means this machine's real vault root, which makes the check exact here; set it to the length of the deepest place the vault is synced to when that is longer. A value below the real root's length is reported as a warning rather than quietly applied.
- `sidecarNoteNamePattern`
  - names the sidecar note that carries a renamed attachment's original name. Tokens: `{{fileName}}`, `{{basename}}`, `{{extension}}`. The default `{{fileName}}.md` makes `diagram.png` answer `diagram.png.md`, which cannot collide with a real note the way `{{basename}}.md` can.
- `shouldCreateNoteToPreserveOriginalName`
  - create a note to hold the original name when the renamed item has none - a folder with no folder note, an attachment with no sidecar. Off by default, in which case those are simply listed in the consistency report and nothing new appears on disk.

## Reports, folders, and safety

- `consistencyReportFile`
  - path of the note generated by **Check Vault Consistency** (default `consistency-report.md`).
- `treatAsAttachmentExtensions`
  - extensions that should be treated as attachments even though they are Markdown, such as `.excalidraw.md`. These files move with their note like any other attachment, and the link-rewriting commands (convert paths, reorganize vault) leave their internal links untouched - so, for example, the wikilinks Excalidraw stores for its embedded images keep working.
- `shouldShowBackupWarning`
  - show the backup warning for destructive operations; while it is on, the plugin reverts the most dangerous settings on load as a safety net.

Change any of these, then work through [01 Collect attachments into the note's folder](<./01 Collect attachments into the note's folder.md>), [03 Check vault consistency](<./03 Check vault consistency.md>), and [04 Reorganize and convert links](<./04 Reorganize and convert links.md>) to watch them take effect.
