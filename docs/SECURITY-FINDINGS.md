# Security Findings Report

**Project:** MRB Learning Platform  
**Audit date:** 2026-06-21  
**Scope:** Production deployment on single Ubuntu 24.04 VPS (PM2 + Nginx)  
**Auditor role:** DevOps / Full-Stack Architecture review

---

## Executive Summary

The application has **substantial security hardening already implemented** in the Express layer (helmet, CORS allowlist, CSRF, JWT rotation, webhook HMAC, upload validation, CEE protection grid). The primary gaps were **operational**: missing production deployment tooling, no reverse-proxy hardening, no graceful shutdown for PM2, and environment/configuration drift between dev and prod.

This audit documents findings by severity, what was remediated in this deployment pass, and remaining recommendations.

| Severity | Count (pre-fix) | Remediated |
|----------|-----------------|------------|
| Critical | 2 | 2 |
| High | 4 | 3 |
| Medium | 6 | 2 |
| Low / Info | 8 | Documented |

---

## 1. Environment & Secret Management

### FINDING SEC-001 — Secrets in repository risk (Critical)

**Issue:** `server/.env` is gitignored but no root-level `.env.example` documented the full production contract. Developers may commit secrets or deploy with placeholder JWT values.

**Status:** **Remediated** — Root `.env.example` + `deployment/scripts/validate-env.sh` enforce required keys before deploy.

**Recommendation:** Use a secrets manager (Doppler, AWS SSM) or encrypted Ansible vault for multi-operator teams.

---

### FINDING SEC-002 — Hardcoded production domain in frontend shell (Low)

**Issue:** `client/index.html` contains canonical/OG URLs for `https://mrbclasses.com/`.

**Status:** **Accepted** — Marketing/SEO metadata, not credentials. Update when deploying to a different domain.

---

### FINDING SEC-003 — MySQL credentials logged at startup (Low)

**Issue:** `server.js` logs `MYSQL_USER`, `MYSQL_HOST`, `MYSQL_DATABASE` on boot.

**Status:** **Open** — Does not log password. Restrict log file permissions (`logs/pm2/` → `640`, owned by deploy user).

---

## 2. JWT & Authentication

### FINDING SEC-010 — JWT secret strength (High)

**Issue:** Weak or placeholder secrets crash at import if present; missing secrets allowed until production startup validation.

**Status:** **Already mitigated** in application code:
- `loadJwtSecret()` rejects `< 32` chars and placeholder patterns
- `validateProductionStartupConfig()` requires secrets in production

**Recommendation:** Rotate secrets with `JWT_*_PREVIOUS_SECRETS` during planned rotation windows.

---

### FINDING SEC-011 — Refresh token & session security (Medium)

**Review:**

| Control | Implementation |
|---------|----------------|
| HttpOnly refresh cookie | Yes — `/api/auth` path |
| CSRF double-submit | Yes — `x-csrf-token` + `csrf_token` cookie |
| Session revocation | Yes — `auth_sessions` table, `token_version` on users |
| Refresh rotation | Yes — with replay grace window |
| Legacy token version | Blocked in production (`ALLOW_LEGACY_TOKEN_VERSION=false`) |

**Status:** **Strong** — Ensure `REFRESH_COOKIE_SECURE=true` and `ACCESS_COOKIE_SECURE=true` on VPS (enforced by `validate-env.sh`).

---

### FINDING SEC-012 — Google OAuth client ID exposure (Info)

**Issue:** `VITE_GOOGLE_CLIENT_ID` is public by design (OAuth web client).

**Status:** **Accepted** — Restrict authorized origins in Google Cloud Console to production domain only.

---

## 3. CORS & Transport

### FINDING SEC-020 — CORS misconfiguration in production (High)

**Issue:** If `CLIENT_URL` does not match the browser origin exactly, authenticated requests fail or (in misconfigured forks) could be too permissive.

**Status:** **Already mitigated** — Strict origin callback in `app.js`; denies unknown origins silently.

**Deployment requirement:** Set `CLIENT_URL=https://your-domain.example` (no trailing slash mismatch).

---

### FINDING SEC-021 — Missing TRUST_PROXY in production (Critical)

**Issue:** Without `trust proxy`, Express sees Nginx as client IP, breaking rate limits, audit IP hashing, and secure cookie logic behind TLS.

**Status:** **Remediated** — `validate-env.sh` requires `TRUST_PROXY`; `ecosystem.config.js` documents `TRUST_PROXY=1`; deployment guide enforces it.

---

## 4. CSRF

### FINDING SEC-030 — CSRF on state-changing routes (Medium)

**Review:** Client attaches CSRF header on mutating requests (`requestClient.js`, `csrfAttachPolicy.js`). Server validates on auth routes.

**Status:** **Adequate** for cookie-based SPA same-site deployment.

**Recommendation:** Keep SPA and API on **same registrable domain** (current Nginx design). Cross-site SPA would require `SameSite=None` + additional CSRF review.

---

## 5. Input Validation & Injection

### FINDING SEC-040 — SQL injection (High)

**Review:** Data access uses `mysql2` parameterized queries. Instructional pool guard blocks ad-hoc table access in production paths.

**Status:** **Low risk** — Continue code review for any raw string concatenation in new queries.

---

### FINDING SEC-041 — XSS (High)

**Review:**

| Layer | Control |
|-------|---------|
| Server | `sanitize-html` on rich content, semantic HTML validators |
| Client | `dompurify` for rendered HTML |
| API | Question/content field limits and security test suites |

**Status:** **Strong** — Nginx adds `X-Content-Type-Options: nosniff`. Helmet CSP active in production (not report-only).

**Recommendation:** Periodically run `npm run test:xss-security` and `npm run test:question-content-security` in CI.

---

## 6. File Uploads

### FINDING SEC-050 — Upload path traversal & entitlement (High)

**Review:**
- Uploads stored under `server/uploads/{namespace}/`
- Served via `/api/uploads` with entitlement grid (not public `express.static`)
- Image re-encoding (sharp), audio metadata validation, rate limits per teacher/IP
- URL validators require `/api/uploads/{namespace}/` prefix

**Status:** **Strong**

**Deployment requirement:** Ensure `server/uploads/` is **outside** Nginx `root` (only proxied through API — current architecture correct).

---

## 7. Rate Limiting

### FINDING SEC-060 — Application vs edge rate limits (Medium)

**Review:** Express `express-rate-limit` on auth, enrollments, test submit, uploads, webhooks. Redis-backed limits fail closed in production.

**Status:** **Remediated at edge** — Nginx zones for general API, auth, and webhooks in `deployment/nginx/`.

**Recommendation:** Monitor 429 rates; tune `mrb_api_auth` if legitimate users hit login limits during campus NAT.

---

## 8. Webhooks & Payment Security

### FINDING SEC-070 — Safepay webhook tampering (Critical)

**Review:**
- Raw body parser **before** `express.json()` for `/api/payments/webhook`
- HMAC-SHA512 with hex secret
- Timestamp skew + Redis replay dedupe + DB ledger
- Fail closed when Redis unavailable in production

**Status:** **Strong**

**Deployment requirement:** Nginx `proxy_request_buffering off` on webhook location (configured).

---

## 9. Admin Surface

### FINDING SEC-080 — Admin path obscurity (Medium)

**Review:** `ADMIN_SECRET_PATH` gates admin UI/API; injected at build into `index.html` only (not JS bundles).

**Status:** **Adequate** as defense-in-depth — not a substitute for auth.

**Requirement:** Rebuild frontend on every `ADMIN_SECRET_PATH` change (`deploy.sh` handles this).

---

## 10. Headers & TLS

### FINDING SEC-090 — Security headers (Medium)

**Review:**

| Header | Express (helmet) | Nginx (added) |
|--------|------------------|---------------|
| HSTS | Production | Yes |
| CSP | Production enforce | Partial (Nginx adds frame/options) |
| X-Frame-Options | helmet | Reinforced |
| Referrer-Policy | yes | Reinforced |

**Status:** **Remediated** for edge layer.

---

## 11. Logging & Monitoring

### FINDING SEC-100 — Sensitive data in logs (Medium)

**Review:** Auth token logging policy documented in `server/docs/auth-token-logging-policy.md`. Request IDs propagated.

**Recommendation:**
- Configure Nginx `log_format` to exclude cookie headers
- Ship logs to centralized store with retention policy
- Alert on PM2 restart loops

---

## 12. Dependency & Supply Chain

### FINDING SEC-110 — npm audit (Low)

**Recommendation:** Run `npm run security:audit` in `server/` during CI. Review lockfile changes on every release.

---

## 13. Infrastructure

### FINDING SEC-120 — Database/Redis exposed to internet (Critical)

**Issue:** Default misconfiguration could expose MySQL/Redis ports.

**Status:** **Remediated in documentation** — UFW allows only 22/80/443; MySQL user bound to `127.0.0.1`; API binds `LISTEN_HOST=127.0.0.1` via PM2 production env.

---

## 14. Graceful Shutdown

### FINDING SEC-130 — Abrupt PM2 restarts (High)

**Issue:** No SIGTERM handler — in-flight requests and BullMQ jobs could be cut mid-flight.

**Status:** **Remediated** — `server.js` graceful shutdown closes HTTP server, email worker, Redis, MySQL pool (`kill_timeout: 15000` in PM2).

---

## Rate Limiting Recommendations Summary

| Layer | Scope |
|-------|-------|
| Nginx | Global API 30 r/s, auth 5 r/s, webhooks 60 r/s |
| Express | Per-route Redis-backed limits (auth, enroll, submit, uploads) |
| Redis | Required in production for fail-closed behavior |

---

## Secure Headers Checklist (Production)

- [x] HSTS enabled (helmet + Nginx)
- [x] `X-Content-Type-Options: nosniff`
- [x] `X-Frame-Options: DENY`
- [x] CSP enforced in production (helmet)
- [x] Cookies: Secure + SameSite appropriate
- [x] TLS 1.2+ via Certbot modern config

---

## Pre-Go-Live Security Checklist

1. [ ] All secrets rotated from any development/staging values
2. [ ] `ALLOW_ADMIN_BOOTSTRAP=false`
3. [ ] `CLIENT_URL` matches production HTTPS origin
4. [ ] Google OAuth authorized origins updated
5. [ ] Safepay live keys match `SAFEPAY_ENV=production`
6. [ ] SendGrid sender domain verified
7. [ ] `./deploy.sh` passes validation and health checks
8. [ ] Backups tested (MySQL restore drill)
9. [ ] `pm2 save` + `pm2 startup` configured
10. [ ] Run `server/docs/security-deployment-checklist.md` items

---

*This report reflects codebase state at audit time. Re-run review after major feature releases.*
