import { adminRoute } from '../../config/adminPaths';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';

function formatMcqPublishIssues(failures) {
  if (!Array.isArray(failures) || !failures.length) return null;
  const firstIssue = failures[0]?.issues?.[0];
  if (!firstIssue?.message) return null;
  const extra = failures.length > 1 ? ` (+${failures.length - 1} more question${failures.length > 2 ? 's' : ''})` : '';
  return `${firstIssue.message}${extra}`;
}

function extractPublishBlockMessage(report) {
  const mcqMessage = formatMcqPublishIssues(
    report?.validation?.publish?.mcq_validation_failures ?? report?.mcq_validation_failures
  );
  if (mcqMessage) return mcqMessage;

  const items = Array.isArray(report?.missing_requirement_items) ? report.missing_requirement_items : [];
  if (items.length) {
    return `Cannot publish yet: ${items.map((item) => item.message || item.code).join(' · ')}`;
  }
  const missing = Array.isArray(report?.missing_fields) ? report.missing_fields.join(', ') : 'required fields';
  return `Cannot publish — incomplete. Missing: ${missing}`;
}

function extractErrorMessage(err, fallback = 'Failed to publish test') {
  const detailsIssues = err?.details?.issues ?? err?.metadata?.issues ?? err?.data?.metadata?.issues;
  if (Array.isArray(detailsIssues) && detailsIssues[0]?.message) {
    const extra =
      detailsIssues.length > 1
        ? ` (+${detailsIssues.length - 1} more issue${detailsIssues.length > 2 ? 's' : ''})`
        : '';
    return `${detailsIssues[0].message}${extra}`;
  }
  return err?.message || fallback;
}

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
      toast.error(extractPublishBlockMessage(report));
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
        navigate(adminRoute(`tests/${tid}/publish`));
      } else if (redirectTo === 'list') {
        navigate(adminRoute('tests'));
      }
    }

    return true;
  } catch (err) {
    toast.error(extractErrorMessage(err));
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
