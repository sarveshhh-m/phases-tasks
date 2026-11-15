# Phase & task graph

Phases and tasks as a dependency graph — plain HTML, CSS and JS, no build step.

- **Phases are connected cards.** Drag the dot on a card's right edge onto another card to say "that one needs this one first".
- **Click a card to open its sub-graph** (subtasks, same idea, as deep as you like). The breadcrumb takes you back up.
- **Dependency check:** blocked cards show what they're waiting on, you can't start a blocked item, and circular dependencies are rejected.
- **Progress rolls up:** a phase's status and progress bar come from its subtasks.

## Run

Open `index.html` in a browser (or `python3 -m http.server` in this folder). Your work saves automatically in the browser.

## Keep your changes in the JSON file

Edits (status, comments, card positions) can be written straight back into your `phases.json`:

- **Any browser:** `start-phases-graph.command path/to/phases.json` (or `python3 serve.py --file path/to/phases.json`). The app opens that file; every change is saved into it, and edits made to the file elsewhere (for example by an AI) appear in the open page within a few seconds.
- **Chrome / Edge:** use **open file…** (or drag the file onto the page) and allow write access; changes are saved to that file.
- Without either, changes stay in the browser's storage only. Safari and Firefox can't write to a picked file, so use the first option there.

The status line shows `● phases.json · saved` while a file is attached.

## Reuse it on any project

1. Paste the contents of [`PROMPT.md`](PROMPT.md) into Claude Code (or any AI) inside the project you want to map. It writes a `phases.json`.
2. Click **Open file** (or drag the JSON onto the page).
3. From the **Project** menu you can export your graph, or export it as a template with progress reset.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Terminal theme (light, JetBrains Mono) |
| `app.js` | Graph logic, rendering, import/export, write-back to the JSON |
| `serve.py` | Local server; with `--file` it reads and writes one JSON file |
| `PROMPT.md` | Prompt that generates a compatible `phases.json` for any project |

## Changing status

- Click the status icon on the left of a card for a small panel: pick To do / In progress / Done and (optionally) add a comment.
- Or hover a card and press `1` / `2` / `3` (to do / in progress / done), `c` to comment.
- A blocked item can't be started or finished until what it depends on is done.
- To rework a done item, pick In progress or To do (or press `1`/`2` on it): you get a confirmation that lists what it affects, plus an optional reason saved as a comment.
