# RapidQuote Repo Guidance

Work only inside the RapidQuote application directory containing this file.
In the enclosing workspace repository, this is `quote-tool-app`.

## Scope

- Stay inside this repo only.
- Do not inspect sibling projects unless explicitly asked.
- Treat this repo as the working root for commands, file reads, and edits.

## Shell Discipline

- Use PowerShell-safe commands only.
- Do not use bash-only syntax, heredocs, or assume Unix utilities are installed.
- Do not assume `rg` is installed. Fall back to PowerShell-native search when needed.

## Execution Style

- Keep tasks narrow and finish one concrete deliverable at a time.
- Inspect only the files directly relevant to the current task before editing.
- Prefer the smallest complete fix over broad cleanup or unrelated refactors.
- If a task is large, complete the smallest shippable slice first.

## Verification

- For code changes, run `npm run build` before finishing unless explicitly told not to.
- Commit locally with a clear message after completing the fix.
- Do not push unless explicitly asked.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
