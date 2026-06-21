import { adminRoute } from '../../config/adminPaths';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';

/**
 * @param {number} testId
 * @param {{
 *   token?: string|null,
 *   toast: { success: (msg: string) => void, error: (msg: string) => void },
 *   onSuccess?: (publishedTest: Record<string, unknown>|null|undefined) => void|Promise<void>,
 *   redirectTo?: 'list' | 'details' | null,
 *   navigate?: (path: string) => void,
 * }} options
 * @returns {Promise<boolean>}
 */
export async function publishTestFlow(testId, options) {
  const { toast, onSuccess, redirectTo = null, navigate } = options;
  const token = options.token ?? getAdminToken();
  const tid = Number(testId);

  if (!Number.isFinite(tid) || tid <= 0) {
    return false;
  }

  try {
    const completenessResponse = await adminApi.getTestCompleteness(token, tid);
    const report = completenessResponse?.data;
    if (!report?.can_publish) {
      const missing = Array.isArray(report?.missing_fields)
        ? report.missing_fields.join(', ')
        : 'required fields';
      toast.error(`Cannot publish — incomplete. Missing: ${missing}`);
      return false;
    }

    const response = await adminApi.publishTest(token, tid);
    const published = response?.data ?? null;
    const link = published?.publicLink;
    toast.success(link ? 'Test published. Public link is ready.' : 'Test published successfully.');

    if (onSuccess) {
      await onSuccess(published);
    }

    if (navigate) {
      if (redirectTo === 'details') {
        navigate(adminRoute(`tests/${tid}/details`));
      } else if (redirectTo === 'list') {
        navigate(adminRoute('tests'));
      }
    }

    return true;
  } catch (err) {
    toast.error(err.message || 'Failed to publish test');
    return false;
  }
}

/**
 * Shared publish flow for admin tests list and wizard steps.
 *
 * @param {string|number|null|undefined} testId
 * @param {{
 *   onSuccess?: (publishedTest: Record<string, unknown>|null|undefined) => void|Promise<void>,
 *   redirectTo?: 'list' | 'details' | null,
 * }} [options]
 */
export function usePublishTest(testId, options = {}) {
  const { onSuccess, redirectTo = null } = options;
  const toast = useAdminToast();
  const navigate = useNavigate();
  const token = getAdminToken();
  const [publishing, setPublishing] = useState(false);
  const inFlightRef = useRef(false);

  const publish = useCallback(async () => {
    if (inFlightRef.current) {
      return false;
    }

    inFlightRef.current = true;
    setPublishing(true);

    try {
      return await publishTestFlow(testId, {
        token,
        toast,
        onSuccess,
        redirectTo,
        navigate,
      });
    } finally {
      inFlightRef.current = false;
      setPublishing(false);
    }
  }, [testId, token, toast, navigate, onSuccess, redirectTo]);

  return { publish, publishing };
}
