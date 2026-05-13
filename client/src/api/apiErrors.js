function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstFieldError(fieldErrors) {
  if (!fieldErrors || typeof fieldErrors !== 'object') return '';
  for (const key of Object.keys(fieldErrors)) {
    const arr = fieldErrors[key];
    const first = Array.isArray(arr) ? arr.find((m) => typeof m === 'string' && m.trim()) : arr;
    if (typeof first === 'string' && first.trim()) return first.trim();
  }
  return '';
}

/**
 * Build a readable message from an API failure body when `message` is missing
 * (e.g. HTML error pages, gateways, non-standard JSON).
 */
export function inferApiFailureMessage(body, { status, statusText, rawText } = {}) {
  const trimmedStatusText = typeof statusText === 'string' ? statusText.trim() : '';
  if (body && typeof body === 'object') {
    if (body.success === false && body.error && typeof body.error === 'object') {
      const em = body.error.message;
      if (typeof em === 'string' && em.trim()) {
        let out = em.trim();
        const dbg = typeof body.debug === 'string' ? body.debug.trim() : '';
        if (dbg && out.toLowerCase() === 'internal server error') out = dbg;
        const rid = body.requestId != null ? String(body.requestId).trim() : '';
        if (rid && status != null && status >= 500) out = `${out} Reference: ${rid}`;
        return out;
      }
    }
    if (typeof body.code === 'string' && body.code.trim()) {
      const m = body.message;
      if (typeof m === 'string' && m.trim()) return m.trim();
    }
    const dbg = typeof body.debug === 'string' ? body.debug.trim() : '';
    const m = body.message ?? body.msg;
    if (typeof m === 'string' && m.trim()) {
      let out = m.trim();
      if (dbg && out.toLowerCase() === 'internal server error') out = dbg;
      const rid = body.requestId != null ? String(body.requestId).trim() : '';
      if (rid && status != null && status >= 500) out = `${out} Reference: ${rid}`;
      return out;
    }
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim();
    const fer = body.details?.fieldErrors ?? body.field_errors;
    const feMsg = firstFieldError(fer);
    if (feMsg) return feMsg;
    const formErr = Array.isArray(body.details?.formErrors) ? body.details.formErrors.filter(Boolean)[0] : null;
    if (typeof formErr === 'string' && formErr.trim()) return formErr.trim();
    if (Array.isArray(body.errors)) {
      const first = body.errors.find((e) => typeof e === 'string' && e.trim());
      if (first) return first.trim();
      const nested = body.errors.find((e) => e && typeof e === 'object' && typeof e.message === 'string' && e.message.trim());
      if (nested?.message) return nested.message.trim();
    }
  }
  const raw = typeof rawText === 'string' ? rawText.trim() : '';
  if (raw.length > 0) {
    if (raw[0] === '{' || raw[0] === '[') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const nested = inferApiFailureMessage(parsed, { status });
          if (nested) return nested;
        }
      } catch {
        // ignore
      }
    }
    const plain = stripHtml(raw.slice(0, 280));
    if (plain.length > 0) return `Server responded with ${status ?? '?'}. ${plain}`;
  }
  if (trimmedStatusText && status != null) return `${trimmedStatusText} (${status})`;
  if (status != null) return `Request failed (${status})`;
  return 'Request failed';
}

/** Attach HTTP metadata for callers that must not treat all failures as logout. */
export function createHttpError(message, { status, refreshAlreadyTried, refreshFailureKind } = {}) {
  const err = new Error(message);
  err.name = 'HttpRequestError';
  if (status != null) err.status = status;
  if (refreshAlreadyTried != null) err.refreshAlreadyTried = refreshAlreadyTried;
  if (refreshFailureKind != null) err.refreshFailureKind = refreshFailureKind;
  return err;
}
