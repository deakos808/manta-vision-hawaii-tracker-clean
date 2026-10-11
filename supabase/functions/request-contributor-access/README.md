# Contributor access request

This deliberately public endpoint receives access requests, never Auth signups,
invitations, photos, or scientific submissions. `/contribute` has its own public
shell. The admin queue requires an active admin at both the router and RLS layers.

## Deployment configuration

- Applied migration: `20261011192132_contributor_access_requests.sql`.
- Deploy only `request-contributor-access` with `verify_jwt = false` as configured.
- Reuse the existing server-key resolver and its explicit backend-key mode.
- `ALLOWED_ORIGINS` must list exact approved origins, comma-separated, without
  wildcards or trailing paths. Confirm `https://www.mantatracker.com`,
  `https://mantatracker.com`, and (if local tests are authorized)
  `http://127.0.0.1:8081`. Preview origins need explicit approval/configuration;
  no wildcard `vercel.app` allowance is introduced.
- Reuse `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, and
  `NOTIFICATION_FROM_EMAIL`. Do not change existing notification configuration.
- The review URL is fixed to the production admin contributor-request queue.

The reviewed function is deployed with JWT verification disabled intentionally.
The existing origin allowlist permits both production domains; localhost is not
currently allowed. No existing secrets or Auth signup settings were changed.

## Boundaries

The body is limited to 12,000 actual bytes, including streamed bodies. Validation
is shared with the page but always repeated on the server. Unknown fields,
HTML angle brackets, invalid regions/counts/years, and unchecked confirmations
are rejected. Email is lowercase; free text is bounded and control characters
are removed. No IP addresses or account-existence checks are used.

A populated honeypot returns generic success without storing or sending. A
service-only SECURITY INVOKER RPC serializes normalized emails with a transaction
advisory lock and suppresses another pending request within 24 hours. This avoids
concurrent duplicate rows/emails without exposing an anonymous database RPC.
CORS and a honeypot do not stop determined non-browser spam or different emails;
CAPTCHA/rate-limit infrastructure is intentionally deferred.

A stored request remains successful if Resend fails. There is no automatic retry
queue; admins can see the request in the queue. Logs contain no applicant content,
credentials, provider bodies, or account details. Resend uses a request-ID
idempotency key.

Admins can update review status/notes only; ordinary users get no rows through
RLS. Invite contributor opens the existing audited invite page with bounded form
prefill only. It does not send an invitation, change role, or link historical
contributions. Mark Invited manually after confirming invitation success.

Rollback drops only the new RPC/table and refuses to proceed if any request rows
exist, preventing accidental loss of applicants. SQL tests are static contracts. Release verification also checked live admin and
ordinary-user RLS in a rolled-back transaction and confirmed one stored request
for repeated synthetic submissions. The synthetic request was removed afterward.
