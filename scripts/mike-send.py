"""
mike-send.py — Mike's safe email queueing script.
ALWAYS use this script to queue emails. Never queue directly without dedup check.

Signature: always load from data/nick-signature.html — NEVER invent a signature or phone number.

Usage: pass a list of email dicts to queue_emails()
"""
import requests
import time
from collections import defaultdict

BASE = "http://localhost:3000"
# DO NOT include a signature in email bodies.
# ms-graph-email.js automatically appends Nick's official Outlook signature.
# Including a signature in the body will result in DOUBLE signatures.
SIGNATURE = ""  # intentionally empty

def get_already_contacted():
    """Pull all emails already in the queue (sent or pending) and return a set of addresses."""
    contacted = set()
    try:
        r = requests.get(BASE + "/api/mike/queue", timeout=10)
        data = r.json()
        queue = data.get("queue", [])
        for item in queue:
            email = (item.get("email") or "").strip().lower()
            if email:
                contacted.add(email)
    except Exception as ex:
        print("WARNING: Could not fetch queue for dedup check: " + str(ex))
    return contacted

def check_body_for_signature(body):
    """Raise an error if the body contains a signature block. Signature is auto-appended by ms-graph-email.js."""
    sig_markers = [
        'Nick.Panyard@inetlte.com',
        'inetLTE.com',
        'Galleria Tower 2',
        '919.864.5912',
        'inetlogo',
        'Nick Panyard<br>',
        'Nick Panyard</p>',
    ]
    for marker in sig_markers:
        if marker.lower() in body.lower():
            raise ValueError(
                f"ERROR: Email body contains signature marker '{marker}'. "
                "DO NOT include a signature in the body — ms-graph-email.js appends it automatically. "
                "Remove the signature from the body before queuing."
            )


def queue_emails(emails, dry_run=False):
    """
    Queue a list of email dicts safely.
    First-touch emails dedupe hard against already-contacted addresses.
    Intentional follow-ups are allowed when touchType == 'follow_up'.
    Each dict must have: leadId, leadName, company, email, subject, body, status
    HARD RULE: Body must NOT contain a signature. Signature is auto-appended by ms-graph-email.js.
    """
    already = get_already_contacted()
    print(f"Already contacted: {len(already)} addresses in queue")
    print("")

    queued = 0
    skipped = 0

    for e in emails:
        # HARD CHECK: block any email body that contains a signature
        try:
            check_body_for_signature(e.get("body", ""))
        except ValueError as sig_err:
            print(f"BLOCKED (signature in body): {e.get('leadName', 'unknown')} — {sig_err}")
            skipped += 1
            continue

        addr = (e.get("email") or "").strip().lower()
        if not addr:
            print("SKIP (no email): " + e.get("leadName", "unknown"))
            skipped += 1
            continue

        touch_type = (e.get("touchType") or "first_touch").strip().lower()
        allow_repeat = touch_type == "follow_up"

        if addr in already and not allow_repeat:
            print("SKIP (duplicate): " + e["leadName"] + " <" + addr + ">")
            skipped += 1
            continue

        if dry_run:
            prefix = "DRY RUN - would queue follow-up: " if allow_repeat else "DRY RUN - would queue: "
            print(prefix + e["leadName"] + " - " + e["company"])
            already.add(addr)
            queued += 1
            continue

        try:
            r = requests.post(BASE + "/api/mike/queue", json=e, timeout=10)
            if r.status_code in (200, 201):
                prefix = "OK follow-up: " if allow_repeat else "OK: "
                print(prefix + e["leadName"] + " - " + e["company"])
                already.add(addr)  # prevent dupes within this batch too
                queued += 1
            else:
                print("FAIL " + str(r.status_code) + ": " + e["leadName"] + " " + r.text[:80])
        except Exception as ex:
            print("ERR: " + e["leadName"] + " " + str(ex))

        time.sleep(0.3)

    print("")
    print("Done: " + str(queued) + " queued, " + str(skipped) + " skipped")
    return queued, skipped


if __name__ == "__main__":
    # Run dedup report only
    already = get_already_contacted()
    print("Current queue — " + str(len(already)) + " unique addresses contacted:")
    for a in sorted(already):
        print("  " + a)
