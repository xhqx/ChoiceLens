# ChoiceLens

ChoiceLens is a focused macOS companion app for [chapter-based guided development](https://github.com/xhqx/codex-learning-skills). It turns a small JSON decision packet into a visual choice screen, keeps recommendations unselected until the user acts, previews the impact of each option, and writes the submitted answer beside the packet.

![ChoiceLens showing a chapter decision with three options and a custom-answer card](docs/choicelens.png)

## What it does

- Shows completed, active, and upcoming development chapters.
- Presents two or three mutually exclusive choices plus a custom-answer card.
- Marks exactly one recommendation without selecting it for the user.
- Displays optional before-and-after impact previews.
- Validates packets before display and answers before saving.
- Stores the answer as a new sibling JSON file without overwriting an earlier answer.

## Install the macOS app

The current prebuilt release supports Apple-silicon Macs (M1 or later).

1. Download `ChoiceLens-0.1.0-macos-arm64.zip` from the [latest release](https://github.com/xhqx/ChoiceLens/releases/latest).
2. Unzip the download.
3. Move `ChoiceLens.app` to one of these locations:
   - `~/.codex/tools/ChoiceLens.app` for use with the guided-development skill; or
   - `/Applications/ChoiceLens.app` for ordinary manual use.
4. Launch ChoiceLens. Click **Open JSON** and select a decision packet such as [`sample-packet.json`](sample-packet.json).

To install it in the Codex tools directory from Terminal:

```bash
mkdir -p "$USER/.codex/tools"
ditto "/path/to/ChoiceLens.app" "$USER/.codex/tools/ChoiceLens.app"
open "$USER/.codex/tools/ChoiceLens.app"
```

When upgrading, quit ChoiceLens and move the previous app to the Trash before copying the new version.

### First-launch security notice

Version 0.1.0 is ad-hoc signed and is not notarized with Apple. macOS may block its first launch. In Finder, Control-click `ChoiceLens.app`, choose **Open**, and confirm **Open**. Do not disable Gatekeeper system-wide.

## Use it with Codex

Install the [`guided-development`](https://github.com/xhqx/codex-learning-skills/tree/main/skills/guided-development) skill and place ChoiceLens in `~/.codex/tools/ChoiceLens.app`.

The skill can create a packet that follows the schema demonstrated in [`sample-packet.json`](sample-packet.json). Open that packet in ChoiceLens, select or write an answer, and submit it. ChoiceLens writes one of these files beside the original packet:

```text
feature-choice.json
feature-choice.answer.json
feature-choice.answer-2.json
```

The answer contains either `selectedOptionId` or `customAnswer`. Codex can read it and resume the same development chapter.

## Build from source

Requirements:

- macOS with Xcode Command Line Tools;
- Node.js 20 or newer;
- Rust stable toolchain.

Install dependencies and run the checks:

```bash
npm ci
npm test
npm run build
cargo test --workspace
```

Build the application bundle:

```bash
npm run tauri build
```

The macOS application is created at:

```text
target/release/bundle/macos/ChoiceLens.app
```

## Packet safety boundary

ChoiceLens accepts UTF-8 JSON packets up to 1 MiB. The Rust backend validates the schema, option IDs, trade-offs, recommendation count, and submitted answer. It reads only the packet selected by the user and writes a new answer file in the same directory. The app does not require a network connection.

## License

Released under the [MIT License](LICENSE).
