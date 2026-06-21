# Teacher Upload Rate Limiting

Production-grade abuse prevention for teacher Q&A answer uploads (images + audio).

## Threat Model

| Threat | Control |
|--------|---------|
| Spam uploads | Burst limits (session + IP, 60s window) |
| Storage abuse | Sustained hourly + daily caps per teacher and IP |
| Bot activity | IP burst + IP sustained backstops |
| Compromised teacher account | User hourly/daily caps + IP caps (attacker can't exceed IP ceiling) |

## Rate Limit Strategy

Layered **defense in depth** — each request passes all layers; first failure returns 429.

```
Request → requireRedis (prod) → burst session → burst IP → teacher/hour → teacher/day → IP/hour → IP/day → handler
```

### Image limits (default)

| Layer | Scope | Window | Default max |
|-------|-------|--------|-------------|
| Burst | Session | 1 min | 5 |
| Burst | IP | 1 min | 8 |
| Sustained | Teacher | 1 hour | 30 |
| Sustained | Teacher | 24 hours | 100 |
| Sustained | IP | 1 hour | 45 |
| Sustained | IP | 24 hours | 120 |

### Audio limits (default, stricter — CPU/storage heavy)

| Layer | Scope | Window | Default max |
|-------|-------|--------|-------------|
| Burst | Session | 1 min | 3 |
| Burst | IP | 1 min | 5 |
| Sustained | Teacher | 1 hour | 18 |
| Sustained | Teacher | 24 hours | 50 |
| Sustained | IP | 1 hour | 25 |
| Sustained | IP | 24 hours | 70 |

Audio limits are intentionally lower than image limits (larger files, transcoding, duration validation).

## Redis Integration

Counters use `INCR` + `PEXPIRE` via `slidingWindowRateLimit.service.js` (same pattern as auth rate limits).

**Key format:**

```
rl:teacher-upload:{image|audio}:{burst|teacher|ip}:{...}:{id}
```

Examples:

- `rl:teacher-upload:image:burst:session:42:sess-abc`
- `rl:teacher-upload:audio:teacher:day:42`
- `rl:teacher-upload:image:ip:hour:203.0.113.10`

When `REDIS_URL` is set and connected, all instances share counters.

## Multi-Instance Deployment

| Mode | Behavior |
|------|----------|
| **Redis available** | Shared counters across all API replicas — correct global limits |
| **Redis unavailable (dev)** | In-memory fallback per process — limits are per-instance only |
| **Redis unavailable (production)** | `TEACHER_UPLOAD_REQUIRE_REDIS=true` (default in prod) → **503** fail-closed on upload routes |

**Production checklist:**

1. Set `REDIS_URL` on every API instance
2. Keep `TEACHER_UPLOAD_REQUIRE_REDIS=true` (default)
3. Monitor `teacher.question.upload.rate_limit` audit events
4. Alert on sustained 429 rate per teacher ID

## Audit

Every limit violation emits a hardened Q&A audit event:

- **Action:** `teacher.question.upload.rate_limit`
- **Category:** `suspicious_activity`
- **Metadata:** `mediaType`, `scope`, `bucket`, `limitType`, `windowMs`, `max` (no secrets)

## Safe Error Responses

Clients receive:

- HTTP **429** with `{ code: 'RATE_LIMITED' }` — no internal thresholds exposed
- `Retry-After` header (seconds)
- `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining` headers
- User-safe message per layer (no stack traces, no bucket internals)

Redis unavailable in production:

- HTTP **503** with `{ code: 'RATE_LIMIT_UNAVAILABLE' }`

## Configuration

```env
TEACHER_UPLOAD_REQUIRE_REDIS=true

# Image
TEACHER_UPLOAD_IMAGE_BURST_SESSION_PER_MIN=5
TEACHER_UPLOAD_IMAGE_BURST_IP_PER_MIN=8
TEACHER_UPLOAD_IMAGE_TEACHER_PER_HOUR=30
TEACHER_UPLOAD_IMAGE_TEACHER_PER_DAY=100
TEACHER_UPLOAD_IMAGE_IP_PER_HOUR=45
TEACHER_UPLOAD_IMAGE_IP_PER_DAY=120

# Audio
TEACHER_UPLOAD_AUDIO_BURST_SESSION_PER_MIN=3
TEACHER_UPLOAD_AUDIO_BURST_IP_PER_MIN=5
TEACHER_UPLOAD_AUDIO_TEACHER_PER_HOUR=18
TEACHER_UPLOAD_AUDIO_TEACHER_PER_DAY=50
TEACHER_UPLOAD_AUDIO_IP_PER_HOUR=25
TEACHER_UPLOAD_AUDIO_IP_PER_DAY=70
```

## Routes

| Endpoint | Middleware |
|----------|------------|
| `POST /api/teacher/questions/answer/attachment` | `teacherImageUploadRateLimits` |
| `POST /api/teacher/questions/answer/recording` | `teacherAudioUploadRateLimits` |

## Verification

```bash
npm run test:teacher-upload-rate-limit-security
```

## Files

| File | Role |
|------|------|
| `middleware/teacherUploadRateLimit.js` | Layered middleware + audit |
| `services/slidingWindowRateLimit.service.js` | Redis / memory counter |
| `config/teacherUploadRateLimit.config.js` | Env-driven limits |
