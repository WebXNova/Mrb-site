import { HEALTH_WEIGHTS, clampScore, resolveHealthTier } from '../constants/teacherInsights.schema.js';

/** Target: <1h response = 100, 24h = 40, 48h+ = 10 */
export function scoreResponseSpeed(avgSeconds) {
  if (avgSeconds == null || Number.isNaN(Number(avgSeconds))) return 50;
  const s = Number(avgSeconds);
  if (s <= 3600) return clampScore(100 - (s / 3600) * 15);
  if (s <= 86400) return clampScore(85 - ((s - 3600) / 82800) * 45);
  if (s <= 172800) return clampScore(40 - ((s - 86400) / 86400) * 30);
  return 10;
}

/** ~20 events/week = 100 */
export function scoreActivityFrequency(eventsLast7d) {
  const n = Number(eventsLast7d) || 0;
  return clampScore(Math.min(100, (n / 20) * 100));
}

/** Answer rate 0–100% */
export function scoreAnswerRate(answered, totalAssigned) {
  const total = Number(totalAssigned) || 0;
  if (total === 0) return 70;
  const rate = (Number(answered) || 0) / total;
  return clampScore(rate * 100);
}

/** Active days out of 14 */
export function scoreConsistency(activeDaysLast14) {
  const days = Number(activeDaysLast14) || 0;
  return clampScore((days / 14) * 100);
}

/** % of answered questions seen by students */
export function scoreStudentEngagement(seenRate) {
  if (seenRate == null || Number.isNaN(Number(seenRate))) return 50;
  return clampScore(Number(seenRate) * 100);
}

/**
 * @param {{
 *   avgResponseSeconds: number|null,
 *   eventsLast7d: number,
 *   answered: number,
 *   totalAssigned: number,
 *   activeDaysLast14: number,
 *   seenRate: number|null,
 * }} metrics
 */
export function computeTeacherHealthScore(metrics) {
  const components = {
    responseSpeed: scoreResponseSpeed(metrics.avgResponseSeconds),
    activityFrequency: scoreActivityFrequency(metrics.eventsLast7d),
    questionsAnswered: scoreAnswerRate(metrics.answered, metrics.totalAssigned),
    consistency: scoreConsistency(metrics.activeDaysLast14),
    studentEngagement: scoreStudentEngagement(metrics.seenRate),
  };

  const score = clampScore(
    components.responseSpeed * HEALTH_WEIGHTS.responseSpeed +
      components.activityFrequency * HEALTH_WEIGHTS.activityFrequency +
      components.questionsAnswered * HEALTH_WEIGHTS.questionsAnswered +
      components.consistency * HEALTH_WEIGHTS.consistency +
      components.studentEngagement * HEALTH_WEIGHTS.studentEngagement
  );

  const tier = resolveHealthTier(score);

  return {
    score,
    label: tier.label,
    tier: tier.tier,
    components,
  };
}
