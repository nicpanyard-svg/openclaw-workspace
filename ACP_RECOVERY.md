# ACP Recovery Runbook

Use this when an OpenClaw ACP task fails early with `acpx exited with code 1`.

## What is proven locally

- The gateway can stay healthy while ACP launches fail.
- One logical ACP spawn can leave multiple task rows behind:
  - `cli`
  - `acp`
  - `subagent`
- One logical ACP spawn can also leave multiple flow rows behind.
- Built-in maintenance helps prune some stale flow rows, but it can leave stale `running` task rows behind.
- When stale `running` rows remain, later ACP work is much more likely to wedge again instead of starting cleanly.

## What is inferred

- The dominant failure pattern here is stale launch bookkeeping, not a simple plugin install failure.
- There may also be Codex-home/runtime drift in the ACP path, because recent live rollout logs have been landing under the shared `C:\Users\IkeFl\.codex` tree while the isolated ACP home under `C:\Users\IkeFl\.openclaw\acpx\codex-home` has not been updating consistently.
- That second point matters, but the safest local recovery action is still to clear the wedged task state before respawning.

## Default recovery command

Run this from the workspace:

```powershell
.\scripts\invoke-acp-recovery.ps1
```

This script:

- checks gateway health
- counts current `running` tasks
- counts recent failed ACP launches with `acpx exited with code 1`
- runs `openclaw tasks maintenance --apply`
- restarts the gateway cleanly
- checks whether stale `running` tasks still remain

If the script exits cleanly and reports `SAFE_TO_RESPAWN`, retry the ACP task once.

If the script reports `UNSAFE_TO_RESPAWN`, do not immediately queue another ACP run. Escalate to stale task/database repair first.

## Why this is safer than the old routine

The old recovery note assumed `tasks maintenance --apply` plus a restart was enough. That is not true in this workspace.

Recent evidence showed:

- `tasks maintenance --apply` pruned stale flow rows
- but stale `running` task rows still remained
- and `openclaw status --deep` still showed active/running tasks after maintenance

That means recovery must verify post-cleanup state before treating the system as healthy.

## Manual fallback sequence

If you need to run the same steps by hand:

```powershell
cmd /c openclaw gateway call health
cmd /c openclaw tasks maintenance --apply
.\scripts\restart-gateway.ps1
cmd /c openclaw status --deep
```

Do not rely on bare `openclaw ...` inside PowerShell on this machine. Use `cmd /c openclaw ...` to avoid local PowerShell execution-policy friction with `openclaw.ps1`.

## Stop conditions

Do not respawn ACP yet if any of these are still true after recovery:

- `openclaw status --deep` still shows non-zero `running` tasks that should already be finished
- the recovery script reports duplicate stale labels still running
- new failed launches immediately recreate the same `cli` / `acp` / `subagent` triplet pattern

## Next escalation

If recovery stays unsafe, the next step is not more prompt tweaking. The next step is targeted stale-state repair with backups of:

- `C:\Users\IkeFl\.openclaw\tasks\runs.sqlite`
- `C:\Users\IkeFl\.openclaw\flows\registry.sqlite`

Do not start with manual deletion of session files.
