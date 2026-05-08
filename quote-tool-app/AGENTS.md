# RapidQuote Repo Guidance

Work only inside this repository:
`C:\Users\IkeFl\.openclaw\workspace\quote-tool-app`

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
