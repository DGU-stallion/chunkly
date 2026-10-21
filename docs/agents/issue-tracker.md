# Issue tracker

**Local markdown.** Issues for this repo live as files under `.scratch/<feature>/issues/`, one file per ticket.

- Create: write `.scratch/<feature>/issues/NN-<slug>.md`
- Ticket number: zero-padded ordinal within the feature folder
- Blocking edges: a `## Blocked by` section listing ticket filenames (or `None`)
- Status: a `Status:` line at the top (`open` | `in-progress` | `done`)
- Triage labels: not used (triage skill is not installed for this repo)

Skills that read/write this tracker: `to-tickets`, `to-spec`, `implement`, `code-review`.
