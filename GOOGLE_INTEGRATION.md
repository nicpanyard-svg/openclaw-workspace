# Google Integration Status

## Current State
- `gog` is installed and working on this machine.
- Existing auth token present for `ike.flickema@gmail.com`.
- Verified live Gmail access locally with:
  - `gog auth list`
  - `gog gmail search --account ike.flickema@gmail.com --plain "newer_than:30d" --max 1`
- Current stored account entry shows:
  - account: `ike.flickema@gmail.com`
  - client: `default`
  - services: `gmail`
  - auth type: `oauth`

## What Looks Good
- Google auth is **not fully blocked** right now.
- The current token appears limited to **Gmail only**, which is much better than the earlier broad-consent scare.
- The watchdog email fallback depends on this Gmail path and should currently work, assuming the refresh token remains valid.

## Main Risks / Gaps
1. **OAuth client secret exposure**
   - Workspace memory notes confirm the Google OAuth client secret was exposed in a screenshot during setup.
   - Treat the current OAuth client as compromised.
   - Even if the current refresh token still works, keeping that client in place is not a good steady-state.

2. **No written reauth / cutover checklist**
   - If the client is rotated, the current stored token may stop working or should be intentionally replaced.
   - There was no local checklist for rotating the client and reauthorizing without confusion.

3. **Service expansion needs discipline**
   - If Calendar/Drive/Docs/Sheets are added later, they should be authorized intentionally.
   - Do **not** jump back to `--services all` or broad extra scopes unless there is a specific use case.

## Recommended Scope Strategy
### For now
Keep Google limited to the smallest useful surface:
- `gmail`

If read-only inbox management is enough for a given workflow, consider reauthing with:
- `--services gmail --readonly --gmail-scope readonly`

However, if Ike needs to send mail from Gmail (watchdog alerts, drafts, replies), read-only is **not enough**.
In that case use:
- `--services gmail --gmail-scope full`

### Later, only as needed
Add services one at a time when there is an actual workflow to support:
- Calendar: `--services gmail,calendar`
- Drive/docs/sheets only when those workflows are ready

## Reauth / Rotation Plan
1. In Google Cloud Console:
   - Create a **new OAuth client** for gog/OpenClaw use.
   - Do not reuse the exposed client if it can be avoided.
   - After cutover, revoke/delete the exposed client.

2. Load the new credentials into gog:
   - `gog auth credentials set <path-to-new-client-secret.json>`

3. Reauthorize intentionally with the smallest needed scope set:
   - Gmail send/read use:
     - `gog auth add ike.flickema@gmail.com --services gmail --gmail-scope full --force-consent`
   - Gmail read-only use:
     - `gog auth add ike.flickema@gmail.com --services gmail --readonly --gmail-scope readonly --force-consent`

4. Validate immediately after reauth:
   - `gog auth list`
   - `gog gmail search --account ike.flickema@gmail.com --plain "newer_than:7d" --max 3`
   - If send access is intended, send a test message to Nick only.

5. After successful cutover:
   - Revoke old app/client in Google Cloud / Google Account security view.
   - Confirm watchdog still works.

## Practical Next Command Set
### Check current auth
`gog auth list`

### Check current Gmail read access
`gog gmail search --account ike.flickema@gmail.com --plain "newer_than:7d" --max 5`

### Reauth with Gmail send/read only
`gog auth add ike.flickema@gmail.com --services gmail --gmail-scope full --force-consent`

### Reauth with Gmail read-only only
`gog auth add ike.flickema@gmail.com --services gmail --readonly --gmail-scope readonly --force-consent`

## Decision Point
Before rotating anything, decide which of these is actually needed:
- **A. Gmail read-only assistant**
- **B. Gmail read + send assistant**

Because the watchdog sends email alerts, the current workspace likely needs **B** unless that alert path is redesigned.

## Recommendation
Short version:
- Keep services narrowed to Gmail only for now.
- Rotate the compromised OAuth client next.
- Reauth with the minimum Gmail scope that still supports the watchdog + intended inbox workflow.
- Only add Calendar/Drive/Docs/Sheets later, one at a time.
