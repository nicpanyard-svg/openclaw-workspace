# LinkedIn Login Status

Date: 2026-03-20

## Outcome

LinkedIn login is reachable through the supported OpenClaw browser path:
- `openclaw browser`
- dedicated `openclaw` Chrome profile
- direct CDP control

The LinkedIn sign-in page loaded successfully at:
- `https://www.linkedin.com/login`

## What I verified

Working in the supported browser path:
1. `openclaw browser start --json`
2. `openclaw browser open https://www.linkedin.com/login --json`
3. `openclaw browser snapshot --json`
4. Browser remained healthy enough to inspect the page structure and confirm the login form

Snapshot confirmed these visible login elements:
- `Email or phone`
- `Password`
- `Sign in`
- `Forgot password?`
- alternative sign-in options for Google, Microsoft, and Apple

Also observed on the page:
- Google reCAPTCHA enterprise iframe

## Current blocker

No hard blocker to reaching the login page.

The likely real-world blockers are after the human starts login:
- LinkedIn anti-automation / reCAPTCHA checks
- MFA / verification prompt
- account-security challenge triggered by a fresh browser profile or new device

I did **not** submit credentials or attempt risky bypasses.

## Safest practical setup

Use the dedicated OpenClaw browser profile (`openclaw`) and let Nick or Mike complete the sensitive steps manually inside that browser window.

Why this is the safest path:
- it is the supported OpenClaw browser route
- it avoids unsupported bypass tricks
- it keeps the login session in a dedicated browser profile instead of mixing with a personal everyday browser

## Notes / rough edges

- Browser commands should be run **serially**, not in parallel.
- Parallel browser RPCs can still trigger gateway closure (`1000 normal closure`).
- That is an OpenClaw/browser-control rough edge, not a LinkedIn reachability problem.

## Recommended next steps for Nick

1. Start the browser if needed:
   - `openclaw browser start`
2. Open LinkedIn login:
   - `openclaw browser open https://www.linkedin.com/login`
3. In the dedicated OpenClaw Chrome window, manually enter:
   - email: `nick.panyard@gmail.com`
   - password: manually, not through chat
4. Complete any MFA / email / phone / app verification challenge manually
5. After login succeeds once, keep using the same dedicated `openclaw` profile for LinkedIn to reduce repeated device-challenge friction

## If login fails

Most likely causes to check, in order:
1. MFA code or verification method unavailable
2. LinkedIn flags the session as unusual and asks for extra verification
3. reCAPTCHA / anti-bot challenge requires direct human interaction in the browser window
4. profile/session got reset and LinkedIn sees a new device again

## Bottom line

The supported OpenClaw browser path is ready for a human-guided LinkedIn login.
The main unknown is LinkedIn's post-credential trust checks, not browser access.
