import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  activateCoupon,
  createCoupon,
  deactivateCoupon,
  listCoupons,
  updateCoupon,
} from '../services/coupons.service.js';

function parseActorId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function parseCouponIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid coupon id');
  }
  return id;
}

function parseActorRole(req) {
  return typeof req.user?.role === 'string' ? req.user.role : 'admin';
}

export const getCoupons = asyncHandler(async (_req, res) => {
  const coupons = await listCoupons();
  sendSuccess(res, { coupons, canWrite: true });
});

export const postCoupon = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const coupon = await createCoupon({
    body: req.body,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { coupon }, 201);
});

export const putCoupon = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const couponId = parseCouponIdParam(req);
  const coupon = await updateCoupon({
    couponId,
    body: req.body,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { coupon });
});

export const putCouponActivate = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const couponId = parseCouponIdParam(req);
  const coupon = await activateCoupon({
    couponId,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { coupon });
});

export const putCouponDeactivate = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const couponId = parseCouponIdParam(req);
  const coupon = await deactivateCoupon({
    couponId,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { coupon });
});
