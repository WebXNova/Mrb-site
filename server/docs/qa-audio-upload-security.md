# Q&A Audio Recording — Production Hardening

## Overview

Student and teacher voice recordings now use a hardened server-side pipeline. **No client value is trusted** for acceptance — including `durationSec`, `Content-Type`, `X-MRB-QA-Source`, or filename extension alone.

### Pipeline

1. Multer writes temp file: `{userId}-rec-{hex16}.upload`
2. `validateSecureAudioUpload` — magic bytes, extension agreement, polyglot scan, `music-metadata` parse
3. Server verifies container, codec allowlist, duration (1–120s), and file size
4. Final file: `{userId}-rec-{hex48}.{webm|ogg|m4a}`
5. Response returns **server-measured** `durationSec` only

## Allowed formats

| Container | Extensions | Codecs |
|-----------|------------|--------|
| WebM | `.webm` | Opus, Vorbis |
| Ogg | `.ogg` | Opus, Vorbis |
| MPEG-4 | `.m4a`, `.mp4` | AAC |

Rejected: MP3, WAV, FLAC, video containers, SVG/HTML polyglots, unsupported codecs.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `QA_AUDIO_UPLOAD_MAX_BYTES` | `10485760` | Max file size (10 MiB) |
| `QA_AUDIO_UPLOAD_MAX_DURATION_SEC` | `120` | Max duration (server-verified) |
| `QA_AUDIO_UPLOAD_MIN_DURATION_SEC` | `1` | Min duration |

## Rate limiting

Dedicated audio limits (stricter than image uploads):

**Student** (`/student/questions/recording`):
- 3/min burst per session
- 20/hour per student
- 50/hour per IP

**Teacher** (`/teacher/questions/answer/recording`):
- 3/min burst per session
- 25/hour per teacher
- 50/hour per IP

## Audit events

| Action | When |
|--------|------|
| `student.question.recording.validation_failed` | Rejected upload |
| `student.question.recording.mime_mismatch` | Client MIME ≠ detected (accepted if signature valid) |
| `student.question.recording.success` | Stored recording |
| `teacher.question.recording.*` | Same for teacher namespace |

Entity types: `student_qa_audio_upload`, `teacher_qa_audio_upload`.

## Migration

**No database migration.** Existing `-rec-` files continue to work. New recordings use cryptographically random server filenames while preserving `{userId}-rec-` prefix for ACL binding.

Optional cleanup:
```bash
find server/uploads/student-qa -name '*-rec-*.upload' -mtime +1 -delete
find server/uploads/teacher-qa -name '*-rec-*.upload' -mtime +1 -delete
```

## Deployment

1. Deploy server (requires `music-metadata` — installed via `npm install`)
2. Set env limits if needed
3. Run `npm run test:qa-audio-upload-security`
4. Monitor `activity_logs` for `*.recording.validation_failed` spikes

## Security rationale

| Threat | Control |
|--------|---------|
| Forged duration | Ignored; measured via `music-metadata` |
| Recorder header spoof | Header not used for acceptance |
| MIME spoofing | Magic bytes + parse; MIME logged only |
| Polyglot payloads | Full-file dangerous-marker scan |
| Truncated/malformed audio | Min size + parse failure → reject |
| Oversized files | Multer limit + stat verification |
| Long recordings | Server duration cap (120s) |
| Unsupported codecs | Explicit codec allowlist per container |
| Storage abuse | Dedicated rate limits + max size |
| Info disclosure | Generic rejection messages to clients |

## Dependency

- `music-metadata` — server-side container/codec/duration verification
