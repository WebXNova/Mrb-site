# Incident Response Runbook (Auth + Verification)

## Severity Definitions
- Sev1: auth outage, replay surge, token leakage, provider suppression spike.
- Sev2: sustained resend abuse, elevated verify failures, queue lag growth.
- Sev3: localized failures, non-critical telemetry degradation.

## Immediate Triage
1. Capture `x-request-id` samples from failing requests.
2. Check `/api/ready` for Redis and queue readiness.
3. Review `activity_logs` for:
   - `auth.refresh_replay_confirmed`
   - `verification.failed_invalid`
   - `auth.rate_limit`
   - `email.delivery_failed`
4. If Redis degraded, enforce emergency traffic reduction at edge and keep critical writes fail-closed.

## Token Leak Response
1. Disable verification links at edge temporarily.
2. Rotate verification transport to POST-only if not already active.
3. Force user re-auth by bumping `token_version` for impacted users.
4. Audit logs for query-string token remnants and purge.

## Replay Storm Response
1. Increase replay/risk scoring sensitivity.
2. Block abusive subnet/ASN at WAF and app limiter levels.
3. Monitor refresh mismatch/replay counters and session revocation rates.

## Provider Failure Response
1. Keep outbox accepting writes.
2. Throttle resend endpoint aggressively.
3. Process DLQ backlog after provider recovery.
4. Re-enable normal rate profile after bounce/complaint rates normalize.

