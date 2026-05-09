# Auth Token Logging Policy

This policy prevents leakage of verification and auth tokens through operational tooling.

## Never log

- URL query strings for `/api/auth/*` endpoints.
- Request/response bodies containing `token`, `access_token`, `refresh_token`, `authorization`, `code`, `otp`, or password values.
- Browser telemetry fields containing raw verification tokens.

## Backend requirements

- Use path-only logging for request routes (`/api/auth/...`) or redacted URL serializers.
- Apply centralized metadata redaction before audit/activity logging.
- Ensure error logs do not print raw `req.originalUrl` with sensitive query params.

## Proxy/CDN/WAF requirements

- Nginx / ALB / Cloudflare / CDN:
  - disable query-string logging for `/api/auth/*`, or apply key-based redaction.
  - disable request-body capture for auth verification endpoints.
- WAF and APM:
  - redact sensitive request fields and URL query params before storage/export.
- Log retention:
  - keep auth security logs least-privilege accessible and time-bounded.

## Verification transport requirements

- Email links may use fragment token (`#token=...`).
- Frontend must scrub token from URL immediately via `history.replaceState`.
- Backend verification must use POST body token transport; avoid query token transport.

## Operational checks before release

1. Trigger invalid verification requests and confirm no raw token appears in:
   - app logs
   - database activity logs
   - APM traces
   - proxy access logs
2. Verify telemetry redaction in browser debug mode.
3. Confirm alerting pipelines do not include sensitive auth payload fields.

