# Security Deployment Checklist

## Auth and Transport
- [ ] `GET /api/auth/verify-email` removed in production.
- [ ] Verification tokens accepted only in POST body.
- [ ] `trust proxy` value matches deployed edge chain exactly.
- [ ] `REFRESH_COOKIE_SECURE` and `ACCESS_COOKIE_SECURE` are true.

## Secrets and Supply Chain
- [ ] JWT and webhook secrets rotated with dual-key overlap.
- [ ] CI masks secrets and blocks logs containing token-like values.
- [ ] `npm audit --omit=dev` enforced in CI gate.
- [ ] Lockfile changes reviewed and signed in release process.

## Redis / Queue / Provider
- [ ] Redis health monitored and alerting configured.
- [ ] Outbox + DLQ tables monitored for backlog and age.
- [ ] Webhook signature and replay protections enabled.
- [ ] Provider bounce/complaint threshold alerts configured.

## Observability
- [ ] `x-request-id` propagated through responses and logs.
- [ ] Auth, verification, resend, replay dashboards deployed.
- [ ] Incident runbook linked in on-call alert payloads.
- [ ] `/api/ready` monitored in uptime checks.

