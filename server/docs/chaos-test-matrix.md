# Chaos Test Matrix (Auth + Verification)

## Objectives
- Verify deterministic behavior during dependency outages.
- Confirm fail-closed behavior for critical auth write paths.
- Validate replay and abuse protections under concurrency.

## Scenarios
1. Redis unavailable during signup/resend/verify.
   - Expected: signup/resend protected paths degrade/fail-closed.
2. Queue unavailable with SMTP available.
   - Expected: outbox status updates still recorded, no silent loss.
3. SMTP provider outage.
   - Expected: retries + DLQ transition for terminal failures.
4. DB lock contention on verification token row.
   - Expected: single token consumption, no duplicate verify success.
5. Parallel refresh replay flood.
   - Expected: single refresh win, replay detection logs, optional session revoke.
6. Webhook replay flood.
   - Expected: signature/timestamp validation rejects stale or replayed payloads.
7. Distributed IP/subnet/ASN abuse simulation.
   - Expected: layered limiters trigger blocks/challenges before infrastructure saturation.

## Pass Criteria
- No bypass of `requireVerified` and protected policy gates.
- No token leak paths through query transport.
- No dropped email events without outbox state.
- Replay attempts produce actionable telemetry and alerts.

