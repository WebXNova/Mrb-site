# Q&A Image Upload — Production Hardening

## Overview

Student (`student-qa`) and teacher (`teacher-qa`) image attachments now use the same hardened raster pipeline as Question Bank uploads:

1. Multer writes a cryptographically random **temp** file (`{userId}-{hex}.upload`)
2. `validateSecureRasterImageUpload` — magic bytes, extension agreement, polyglot scan, double-extension block
3. `reencodeValidatedRasterImage` (sharp) — decode, dimension/pixel-bomb limits, strip EXIF/ICC, re-encode
4. Server writes final file with new name (`{userId}-{hex48}.{jpg|png|webp}`)
5. Files stored under `server/uploads/{namespace}/` — **not** web-root static; served only via `/api/uploads/*` entitlement checks

## Migration Requirements

**No database migration required.** Upload URLs are opaque paths stored in `student_questions.attachment_url` / `answer_attachment_url`.

| Change | Impact |
|--------|--------|
| New filename shape | `{userId}-{48hex}.{ext}` instead of `{userId}-{timestamp}-{random}.{ext}` |
| Ownership prefix | Unchanged — still `{userId}-` (secure media ACL preserved) |
| Existing files | Continue to work; no re-encoding of legacy uploads |
| Orphan temp files | `.upload` temps are deleted on success/failure; safe to purge stale `*.upload` from upload dirs after deploy |

**Optional cleanup (post-deploy):**

```bash
# Remove abandoned multer temp files older than 24h (if any)
find server/uploads/student-qa -name '*.upload' -mtime +1 -delete
find server/uploads/teacher-qa -name '*.upload' -mtime +1 -delete
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `QA_IMAGE_UPLOAD_MAX_BYTES` | `5242880` | Max upload size (bytes) |
| `QA_IMAGE_UPLOAD_MAX_WIDTH` | `8000` | Max width (pixels) |
| `QA_IMAGE_UPLOAD_MAX_HEIGHT` | `8000` | Max height (pixels) |
| `QA_IMAGE_UPLOAD_MAX_PIXELS` | `64000000` | Pixel-bomb guard (width × height) |

## Audit Events

Rejected and successful uploads are logged to `activity_logs`:

| Action | When |
|--------|------|
| `student.question.upload.validation_failed` | Student upload rejected |
| `student.question.upload.mime_mismatch` | Client MIME ≠ detected kind (still accepted if signature valid) |
| `student.question.upload.success` | Student upload stored |
| `teacher.question.upload.*` | Same for teacher namespace |

Entity types: `student_qa_upload`, `teacher_qa_upload`.

## Production Deployment Notes

1. **Deploy server** with updated code; restart Node process.
2. **Set env limits** if defaults are too permissive for your hosting tier.
3. **Verify sharp** is installed (`npm ls sharp` in server directory).
4. **Run security tests:**
   ```bash
   npm run test:qa-image-upload-security
   npm run test:teacher-question-answer-security
   ```
5. **Confirm upload dirs exist** and are writable: `uploads/student-qa`, `uploads/teacher-qa`.
6. **Monitor** `activity_logs` for spikes in `*.validation_failed` (possible attack traffic).
7. **No CDN/cache change** — URLs remain `/api/uploads/{namespace}/{filename}` behind auth.

## Security Rationale

| Threat | Control |
|--------|---------|
| MIME spoofing | Acceptance by magic bytes only; MIME mismatch audited, not trusted |
| Extension spoofing | Extension must match detected kind; blocked list for svg/gif/html/php/zip |
| Double extensions | Inner segments checked against blocked extensions |
| Polyglot (PHP/HTML/ZIP in image) | Full-file scan (up to max bytes) for dangerous markers |
| SVG/HTML/JS upload | Blocked extensions + invalid signatures + polyglot markers |
| Malformed images | sharp `failOn: 'error'` + re-encode failure → reject |
| EXIF/metadata leaks | Stripped on re-encode (`exif`/`icc` undefined) |
| Pixel bombs | `limitInputPixels` + explicit width×height×pixel cap |
| Path traversal | Basename-only storage; resolved path prefix check |
| Predictable filenames | `randomBytes(24)` server-side final names |
| Information disclosure | Generic `Upload was rejected.` to clients; details in server logs + audit |

## Out of Scope

Audio uploads (`-rec-` filenames) use a separate pipeline and were not modified in this change.
