Analyze this project (code, docs, README, TODOs, git history, issue lists, roadmap — whatever exists) and write a single JSON file named `phases.json` in the project root that describes the project's phases and tasks as a dependency graph. It will be opened in a graph viewer that edits the same file (status changes and comments are written back into it), so follow the format exactly.

## Format (TypeScript type)

```ts
type Status = "todo" | "doing" | "done";

interface Item {
  id: string;            // unique among its siblings (same level), short kebab-case, e.g. "api-design"
  title: string;         // short, max ~40 characters (shown on 2 lines of ~20 characters)
  status?: Status;       // default "todo"
  notes?: string;        // optional one-liner, max ~60 characters (shown truncated on the card)
  dependsOn?: string[];  // ids of SIBLINGS that must be done first; default []
  tasks?: Item[];        // optional sub-graph for this item: same shape, own ids, own dependsOn

  // Written by the app when you edit in it. OMIT both when generating the file:
  comments?: { at?: string; status?: Status; text?: string }[];  // status-change / comment history (ISO timestamps)
  x?: number; y?: number;                                         // card position on the canvas
}

interface PhasesFile {
  name?: string;         // project name (optional)
  phases: Item[];        // top-level phases, in rough chronological order
}
```

## Example

```json
{
  "name": "My project",
  "phases": [
    {
      "id": "discovery",
      "title": "Discovery",
      "status": "done",
      "tasks": [
        { "id": "interviews", "title": "Interview users", "status": "done" },
        { "id": "brief", "title": "Write brief", "status": "done", "dependsOn": ["interviews"] }
      ]
    },
    {
      "id": "design",
      "title": "Design",
      "dependsOn": ["discovery"],
      "tasks": [
        { "id": "wireframes", "title": "Wireframes", "status": "done" },
        { "id": "visual", "title": "Visual design", "status": "doing", "notes": "Waiting on logo", "dependsOn": ["wireframes"] },
        { "id": "review", "title": "Design review", "dependsOn": ["visual"] }
      ]
    }
  ]
}
```

## Rules

1. Output valid JSON only: no comments, no trailing commas. Use only the fields above; anything else is ignored.
2. Top level is `phases` (typically 3–10 major stages). Give each phase 2–8 `tasks`. Go deeper (tasks inside tasks) only when genuinely useful; two levels is usually enough.
3. `status` must be exactly `"todo"`, `"doing"` or `"done"`. Judge it from the real state of the project (existing code, merged work, open TODOs). If unsure, use `"todo"`.
4. A phase that has `tasks` gets its status from them (all done → done, none started → to do, otherwise in progress), so its own `status` is ignored — you may omit it. Set `status` on leaf items (items without `tasks`).
5. `dependsOn` lists sibling `id`s only (same level). Never reference a parent, a child, or an item at another level. Links to unknown ids, to itself, or that would create a cycle are dropped on import.
6. Dependencies must be real, not just order of listing. Independent work should NOT be chained, so the graph shows what can run in parallel.
7. Keep statuses consistent with dependencies: don't mark an item `"doing"` or `"done"` if something it depends on is not `"done"` (the viewer flags this as "early" / out of order).
8. Leave out `comments`, `x` and `y`. The app adds them as the file is edited, and keeps writing every status change, comment and card move back into this same file.
9. Do not invent work the project does not contain or clearly need next.

After writing the file, check it: valid JSON, every `dependsOn` id exists among its siblings, ids are unique per level, no cycles, no started item depending on an unfinished one. Then tell me in 2–3 lines what you based the phases on.
