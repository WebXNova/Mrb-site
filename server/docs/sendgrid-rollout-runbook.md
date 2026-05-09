# SendGrid Rollout Runbook

## Pre-Flight
- Ensure domain authentication is complete in SendGrid (SPF/DKIM).
- Ensure sender identity matches `EMAIL_FROM`.
- Set `EMAIL_PROVIDER=sendgrid`.
- Set `SENDGRID_API_KEY` in secret manager, never in source control.
- In staging, set `EMAIL_SANDBOX_MODE=true`.

## Canary Rollout
1. Deploy with `EMAIL_PROVIDER=sendgrid` to one instance.
2. Watch:
   - `email.sendgrid.accepted`
   - `email.sendgrid.deferred`
   - `email.sendgrid.rejected`
   - outbox status drift (`queued/processing/failed/dlq`)
3. Confirm no growth in `email_delivery_dlq` beyond expected baseline.

## Rollback
1. Switch `EMAIL_PROVIDER=smtp`.
2. Redeploy application and worker.
3. Keep queue/outbox running; replay pending `failed` jobs after provider stabilization.

## Post-Rollout Verification
- Run `npm run test:route-policy`.
- Run `npm run test:auth`.
- Verify register -> verification email -> verify -> forced re-login flow.

