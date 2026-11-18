# Secure RapidQuote access

## Required before inviting outside users

Access must be limited to approved staff and individually invited guests. Public
self-registration is not approved. Browser-only quote saving can remain in place.

The current browser sign-in is not server-enforced authentication. Updating PDF
libraries, backup validation, and browser headers does not fix that limitation.
Microsoft sign-in is not implemented or activated by this hardening release.

## IT setup

1. Register RapidQuote in the company's Microsoft Entra workforce tenant.
2. Require assignment to the enterprise application. Assign approved staff only.
3. Invite outside users through Entra B2B, then explicitly assign them to RapidQuote.
4. Require multifactor authentication and review the guest access policy.
5. Define least-privilege application roles. Guest users must not receive account
   administration rights or access to other customers' records by default.
6. Establish an owner for access removal, guest expiration, and access reviews.
7. Place application credentials in Vercel's protected environment settings.
   Do not send passwords, client secrets, or access tokens in chat or email.

## Application integration and acceptance

- Use a maintained Microsoft OIDC integration with server-validated sessions.
- Validate tenant, issuer, audience, signature, and assigned application roles.
- Require authentication and authorization on every document and import API.
- Use secure, HttpOnly session cookies; protect state-changing requests from CSRF.
- Remove the prototype password directory and local password-reset flows from
  hosted operation. Rotate any reused prototype credentials.
- Bind access to verified account identifiers, not editable browser role values.
- Keep quote storage on the existing origin. Back up and map existing ownership
  before changing identity identifiers; do not clear browser storage.
- Test staff, invited guests, unassigned users, revoked users, and expired sessions.
- Verify that a browser-store edit cannot grant API or administrative access.
- Provide an authenticated, narrowly scoped print-rendering path for PDF exports.
- Test export/download behavior before replacing the existing access mechanism.

The rollout is complete only when these server-side checks pass. Until then,
restrict use to trusted internal staff and trusted imported files.

## References

- [Microsoft Entra B2B collaboration](https://learn.microsoft.com/en-us/entra/external-id/what-is-b2b)
- [Assign users and groups to an application](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal)
- [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication)
