import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  assertContactRemarkSubmitAllowed,
  createContactRemark,
  listContactRemarks,
  listPostedContactRemarksPublic,
  markContactRemarkAsRead,
  postContactRemarkToHomepage,
  unpostContactRemarkFromHomepage,
} from '../services/contactRemark.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { isValidPkMobile, normalizePkMobile } from '../utils/phoneValidation.js';
import { sanitizePlainText } from '../utils/sanitizeText.js';
import { getClientIp } from '../utils/network.js';

const MIN_FORM_FILL_MS = 3000;
const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;

const contactRemarkSchema = z.object({
  name: z.string().trim().min(2).max(120),
  whatsapp: z
    .string()
    .trim()
    .max(20)
    .refine((v) => isValidPkMobile(v), { message: 'Enter a valid WhatsApp number (e.g. 03XXXXXXXXX)' }),
  email: z
    .preprocess((v) => (v === '' || v == null ? null : String(v).trim()), z.string().email().max(255).nullable()),
  message: z.string().trim().min(5).max(5000),
  pageUrl: z.string().max(255).optional().nullable(),
  _hp: z.string().max(200).optional().nullable(),
  formLoadedAt: z.coerce.number().int().positive().optional().nullable(),
});

export const postContactRemark = asyncHandler(async (req, res) => {
  const parsed = contactRemarkSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid remark payload', parsed.error.flatten());

  const data = parsed.data;

  if (data._hp && String(data._hp).trim()) {
    sendSuccess(res, { message: 'Remark received successfully' }, 201);
    return;
  }

  const loadedAt = data.formLoadedAt;
  if (loadedAt) {
    const elapsed = Date.now() - loadedAt;
    if (elapsed < MIN_FORM_FILL_MS) {
      throw new ApiError(429, 'Please take a moment to complete the form before submitting.', {
        code: 'RATE_LIMITED',
      });
    }
    if (elapsed > MAX_FORM_AGE_MS) {
      throw new ApiError(422, 'This form session expired. Please refresh the page and try again.', {
        code: 'FORM_EXPIRED',
      });
    }
  }

  const whatsapp = normalizePkMobile(data.whatsapp);
  const message = sanitizePlainText(data.message, 5000);

  await assertContactRemarkSubmitAllowed({ whatsapp, message });

  const created = await createContactRemark({
    name: sanitizePlainText(data.name, 120),
    whatsapp,
    email: data.email ? sanitizePlainText(data.email, 255) : null,
    message,
    pageUrl: data.pageUrl || '/contact',
  });

  await logActivity({
    role: 'public',
    action: 'contact_remark.submit',
    entityType: 'contact_remark',
    entityId: created?.id ? String(created.id) : null,
    metadata: {
      ipAddress: getClientIp(req),
      pageUrl: data.pageUrl || '/contact',
    },
  });

  sendSuccess(res, { message: 'Remark received successfully', remark: created }, 201);
});

export const getPublicPostedRemarks = asyncHandler(async (req, res) => {
  const rows = await listPostedContactRemarksPublic(24);
  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
  sendSuccess(res, rows);
});

export const getAdminContactRemarks = asyncHandler(async (req, res) => {
  const rows = await listContactRemarks();
  sendSuccess(res, rows);
});

export const putAdminContactRemarkRead = asyncHandler(async (req, res) => {
  const remarkId = Number(req.params.remarkId);
  if (!remarkId) throw new ApiError(400, 'Invalid remark id');
  const updated = await markContactRemarkAsRead(remarkId);
  if (!updated) throw new ApiError(404, 'Remark not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.contact_remark.mark_read',
    entityType: 'contact_remark',
    entityId: String(remarkId),
  });
  sendSuccess(res, updated);
});

export const postAdminContactRemarkPublish = asyncHandler(async (req, res) => {
  const remarkId = Number(req.params.remarkId);
  if (!remarkId) throw new ApiError(400, 'Invalid remark id');
  const updated = await postContactRemarkToHomepage(remarkId);
  if (!updated) throw new ApiError(404, 'Remark not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.contact_remark.post',
    entityType: 'contact_remark',
    entityId: String(remarkId),
  });
  sendSuccess(res, updated);
});

export const postAdminContactRemarkUnpublish = asyncHandler(async (req, res) => {
  const remarkId = Number(req.params.remarkId);
  if (!remarkId) throw new ApiError(400, 'Invalid remark id');
  const updated = await unpostContactRemarkFromHomepage(remarkId);
  if (!updated) throw new ApiError(404, 'Remark not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.contact_remark.unpost',
    entityType: 'contact_remark',
    entityId: String(remarkId),
  });
  sendSuccess(res, updated);
});
