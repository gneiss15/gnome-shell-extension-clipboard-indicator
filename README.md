# 📋 Clipboard Indicator: performance and reliability fork

A fork of [Tudmotu/gnome-shell-extension-clipboard-indicator](https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator),
based on v71, focused on responsive history operations and reliable JSON storage.

## Why this fork?

Clearing a large clipboard history used to serialize and save the complete
registry and refresh the menu for every removed entry. This could cause long
delays and make GNOME Shell unresponsive. The initial fix was tested locally and
reported in [upstream issue #661](https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator/issues/661).
This fork builds on that fix while keeping the existing JSON format and settings.

## What changed?

- **Batch history updates:** clearing history and trimming it to the size limit
  update storage and the menu once, while preserving favorites and the configured
  selection behavior.
- **Move entries efficiently:** reorder existing menu actors without destroying
  them or saving intermediate states. Selecting an entry with automatic paste
  keeps the new selection instead of restoring the previous entry.
- **Coordinate saves:** allow one active registry write and retain only the latest
  pending snapshot, with bounded retries, error reporting and shutdown draining.
- **Replace files atomically:** use Gio's complete file-replacement operation for
  local JSON storage. Save images before committing their registry references and
  remove unused images after the updated registry has committed.
- **Fix the text editor on GNOME 46:** use the color type expected by that Shell
  version, retaining the newer color API for other versions.
- **Make favorites clear:** use an outlined star for normal entries and a filled
  star for favorites, at normal menu contrast. Press **P** to toggle a favorite.

The extension UUID and GSettings schema are unchanged, so the existing settings
remain compatible. License and copyright notices are preserved.

## Test status

**Locally tested and working on Ubuntu 24.04 / GNOME Shell 46 / X11**
— confirmed by the user on **29 October 2026**.

The local interactive checks passed after the editor, selection and favorite-icon
fixes. Automated tests also cover history operations, rapid save requests, write
ordering, failure recovery, real Gio file operations and JSON roundtrips.

Other GNOME versions have not been tested locally. The previously observed
JSAPI/GC warning has not been proven fixed and remains a point to monitor.

See [DEVELOPMENT.md](DEVELOPMENT.md) for implementation details, test commands,
known limitations and controlled installation/rollback guidance. The upstream
description below is preserved unchanged; its installation links refer to the
original project.

---

<details>
<summary>Original description</summary>

# 📋 Clipboard Indicator

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/eb9af9a1c6f04eb060cb01de6aeb5c84232cd8c0/get-it-on-ego.svg?sanitize=true" width="180" alt="Get it on GNOME Extensions">](https://extensions.gnome.org/extension/779/clipboard-indicator/)



The most popular, reliable and feature-rich clipboard manager for GNOME with
over **2M** downloads.

<img src="./screenshot.png" width="400" alt="A screenshot of the clipboard manager, showing clipboard history including images">

This extension is also packaged by the community for many popular Linux distros
— search your package manager.

## 🧰 Features

* **Image support** — Copy and paste images in addition to text
* **Pin items** — Keep important clipboard entries at the top of the menu
* **Search** — Find clipboard entries with text search, including regex
* **Edit entries** — Modify existing text entries
* **Tag entries** — Add custom labels to organize your clipboard
* **Keyboard shortcuts** — Open/close menu, cycle through entries and activate actions without touching the mouse
* **Auto-clear history** — Schedule automatic clipboard cleanup at regular intervals or at boot time
* **Private mode** — Temporarily pause clipboard history when working with sensitive data
* **Exclude apps** — Prevent clipboard tracking when specific applications are in focus (e.g., password managers)
* **Highly configurable** — Many more settings to control UI & behavior

### In-Menu Keyboard Controls

- Use arrows to navigate
- `<Enter>` to select an item
- `<Delete>` to delete an item
- `v` to paste directly from menu
- `p` to pin item
- `t` to add a tag
- `h` to preview image
- `e` to edit entry

### Terminal support

Pasting from the menu works by sending Shift+Insert to programs or Ctrl+Shift+Insert to terminals.

- To use with tmux, add this to your `.tmux.conf`:

  ```bash
  # Add Ctrl Shift Insert to paste for clipboard-indicator
  bind -T root C-S-IC {
    run "tmux send-key \"$(xclip -d ${DISPLAY} -o -selection clipboard)\""
  }
  ```

- To use with Ghostty, add this to your `.config/ghostty/config`:

  ```bash
  # Add Ctrl Shift Insert to paste for clipboard-indicator
  keybind = ctrl+shift+insert=paste_from_clipboard
  ```

### Known issues

- Copying large images causes a short freeze
- Pasting via menu doesn't work for every application

## 📦 Install from source

Installation via git is performed by cloning the repo into your local gnome-shell extensions directory (usually `~/.local/share/gnome-shell/extensions/`):

```bash
$ git clone https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator.git <extensions-dir>/clipboard-indicator@tudmotu.com
```

After cloning the repo, the extension is practically installed yet disabled. In order to enable it, run the following command:

```bash
$ gnome-extensions enable clipboard-indicator@tudmotu.com
```

## ✅ GNOME Version Support

Depending on your GNOME version, you will need to install the following
Clipboard Indicator versions:

* GNOME 46 and above:
  * Use latest version
* GNOME 45:
  * v57
* GNOME 42-44
  * v47
* GNOME 40-41
  * v39
* GNOME <40
  * v37

## ⌨️ Contributing

Contributions to this project are welcome.

Please follow these guidelines when contributing:

- If you want to contribute code, your best bet is to look for an issue with the label "Up for grabs"
- DO NOT open unsolicited PRs unless they are for updating translations
- Look at the list of previous PRs before you open a PR, if your PR conflicts with another, it will be rejected
- If you have a feature idea, open an issue and discuss it there before implementing. DO NOT open a PR as a platform for discussion

### Release Cycle

This project loosely follows the release cycle of GNOME. That means it will
usually receive 2 updates a year, close to the release of a new major GNOME
version. If there are features you'd like to implement or suggest, it is advised
to start the discussion a month or two before a GNOME release.

</details>
