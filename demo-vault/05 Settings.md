# Settings

Open **Settings -> Community plugins -> Consistent Attachments and Links** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

> [!WARNING]
>
> **Fix Incompatible Paths** and **Reorganize Vault** rename files across the vault, and the settings below decide what they rename. The plugin shows a one-time backup warning about them. Back up a real vault before running them.

## What happens when notes move, rename, or delete

Nothing here — since 4.0.0 those settings belong to [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler), which owns rename and delete handling for the whole vault. Its settings tab is where **Should handle renames**, **Should handle deletions**, **Should rename attachment folder**, **Should update file name aliases**, **Should delete conflicting attachments** and **Empty folder behavior** live now.

This plugin needs that plugin, and does nothing without it: while it is missing or disabled, this plugin loads nothing, says why in a notice and in its settings tab, and installs it in one click. It finishes loading the moment the other plugin appears, with no restart. Installing it changes nothing on its own — its defaults do nothing until you turn renames or deletions on. This vault installs it for you on first open.

Upgrading from 3.x does not lose your answers: this plugin offers them to that plugin once, the first time both are installed, and shows you exactly what would change before anything is written. One bookkeeping key tracks that hand-over, and it has no row in the settings tab:

- `proposedRenameDeleteSettings`
  - the rename and delete values you had in 3.x, waiting to be offered. `null` once the migration has been applied - or from the start, on a fresh install that never had any. Cancelling the offer leaves them here, so it comes back next time.

## Collecting attachments

Nothing here either — since 5.0.0 collecting attachments belongs to [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location), which owns **Collect attachments**, **Move attachment to proper folder** and collecting as you edit. Its settings tab is where **Collect attachments automatically**, **Collect attachment used by multiple notes mode**, **Move attachment to proper folder used by multiple notes mode**, **Exclude paths from attachment collecting** and **Attachment unit folders** live now.

Unlike Advanced Rename and Delete Handler, this plugin does not require it: the report and the path repair work without it. It is suggested instead, by a banner at the top of this plugin's settings tab and, if you had collect settings to hand over, a notice on load that installs it in one click.

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
  - extensions that should be treated as attachments even though they are Markdown, such as `.excalidraw.md`. The **Misplaced attachments** section of the report judges a file listed here like any other attachment, instead of skipping it as a note - which is what a drawing wants, since it belongs to whatever note embeds it. The plugin never rewrites what is written inside such a file. Walked through in [04 Reorganize and convert links](<./04 Reorganize and convert links.md>).
- `shouldShowBackupWarning`
  - show the one-time backup warning about the commands that rename files. It turns itself off once you have seen it.

Change any of these, then work through [03 Check vault consistency](<./03 Check vault consistency.md>), and [04 Reorganize and convert links](<./04 Reorganize and convert links.md>) to watch them take effect.
