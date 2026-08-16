-- Manual payment coupon audit columns — ties a submission to a redeemed coupon.

ALTER TABLE manual_payments
  ADD COLUMN IF NOT EXISTS coupon_id BIGINT UNSIGNED NULL AFTER payment_account_id,
  ADD COLUMN IF NOT EXISTS discount_applied DECIMAL(10, 2) NULL AFTER coupon_id,
  ADD COLUMN IF NOT EXISTS original_amount INT NULL AFTER discount_applied;

-- MySQL versions without IF NOT EXISTS on ADD COLUMN: use ensureManualPaymentsSchema.js instead.

ALTER TABLE manual_payments
  ADD CONSTRAINT fk_manual_payments_coupon
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;
