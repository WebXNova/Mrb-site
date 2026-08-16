import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { getClientIp } from '../utils/network.js';
import {
  activatePaymentAccount,
  createPaymentAccount,
  deactivatePaymentAccount,
  listPaymentAccountAuditLog,
  listPaymentAccounts,
  updatePaymentAccount,
} from '../services/paymentAccounts.service.js';
import { canWritePaymentAccounts } from '../utils/paymentAccountAccess.js';

function parseActorId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function parseAccountIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid payment account id');
  }
  return id;
}

export const getPaymentAccounts = asyncHandler(async (req, res) => {
  const accounts = await listPaymentAccounts();
  const canWrite = await canWritePaymentAccounts(Number(req.user?.id));
  sendSuccess(res, { accounts, canWrite });
});

export const getPaymentAccountAuditLog = asyncHandler(async (req, res) => {
  const accountId = parseAccountIdParam(req);
  const entries = await listPaymentAccountAuditLog(accountId);
  sendSuccess(res, { entries });
});

export const postPaymentAccount = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const account = await createPaymentAccount({
    body: req.body,
    actorId,
    ipAddress: getClientIp(req),
  });
  sendSuccess(res, { account }, 201);
});

export const putPaymentAccount = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const accountId = parseAccountIdParam(req);
  const account = await updatePaymentAccount({
    accountId,
    body: req.body,
    actorId,
    ipAddress: getClientIp(req),
  });
  sendSuccess(res, { account });
});

export const putPaymentAccountActivate = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const accountId = parseAccountIdParam(req);
  const account = await activatePaymentAccount({
    accountId,
    actorId,
    ipAddress: getClientIp(req),
  });
  sendSuccess(res, { account });
});

export const putPaymentAccountDeactivate = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const accountId = parseAccountIdParam(req);
  const account = await deactivatePaymentAccount({
    accountId,
    actorId,
    ipAddress: getClientIp(req),
  });
  sendSuccess(res, { account });
});
