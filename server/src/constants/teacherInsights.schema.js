/**
 * Teacher health score tiers (0–100).
 */
export const HEALTH_TIERS = Object.freeze({
  EXCELLENT: { min: 90, label: 'Excellent', tier: 'excellent' },
  GOOD: { min: 70, label: 'Good', tier: 'good' },
  AVERAGE: { min: 50, label: 'Average', tier: 'average' },
  NEEDS_ATTENTION: { min: 0, label: 'Needs Attention', tier: 'needs_attention' },
});

export const HEALTH_WEIGHTS = Object.freeze({
  responseSpeed: 0.3,
  activityFrequency: 0.25,
  questionsAnswered: 0.25,
  consistency: 0.1,
  studentEngagement: 0.1,
});

export const ALERT_TYPES = Object.freeze({
  INACTIVE: 'inactive',
  HIGH_PENDING: 'high_pending',
  SLOW_RESPONSE_TREND: 'slow_response_trend',
  ACTIVITY_DROP: 'activity_drop',
});

/**
 * @param {number} score
 */
export function resolveHealthTier(score) {
  const s = Number(score);
  if (s >= 90) return HEALTH_TIERS.EXCELLENT;
  if (s >= 70) return HEALTH_TIERS.GOOD;
  if (s >= 50) return HEALTH_TIERS.AVERAGE;
  return HEALTH_TIERS.NEEDS_ATTENTION;
}

/**
 * @param {number} value
 */
export function clampScore(value) {
  return Math.round(Math.min(100, Math.max(0, Number(value) || 0)));
}
