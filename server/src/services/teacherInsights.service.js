import { mysqlPool } from '../config/mysql.js';
import { computeTeacherHealthScore } from './teacherInsightsHealth.service.js';
import { buildTeacherAlerts, getTeacherInsightsActivityFeed } from './teacherInsightsAlerts.service.js';
import { withTeacherInsightsCache } from './teacherInsightsCache.service.js';
import { getTeacherForAdmin } from './teacher.service.js';

function isMissingTable(error, table) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes(table);
}

function toDateKey(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function toMonthKey(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 7);
}

/**
 * Core metrics for one teacher — optimized single round-trip where possible.
 */
async function loadTeacherMetrics(teacherId) {
  const tid = Number(teacherId);

  const metrics = {
    avgResponseSeconds: null,
    eventsLast7d: 0,
    answered: 0,
    totalAssigned: 0,
    pendingCount: 0,
    activeDaysLast14: 0,
    seenRate: null,
    lastActivityAt: null,
    avgResponseRecent: null,
    avgResponsePrevious: null,
    eventsThisWeek: 0,
    eventsPrevWeek: 0,
  };

  try {
    const [qRows] = await mysqlPool.query(
      `SELECT
         COUNT(*) AS total_assigned,
         SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS answered,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         AVG(CASE WHEN status = 'answered' THEN TIMESTAMPDIFF(SECOND, created_at, COALESCE(answered_at, updated_at)) END) AS avg_response,
         AVG(CASE WHEN status = 'answered' AND seen_at IS NOT NULL THEN 1 ELSE 0 END) AS seen_rate
       FROM student_questions
       WHERE assigned_teacher_id = ?`,
      [tid]
    );
    const q = qRows[0] || {};
    metrics.totalAssigned = Number(q.total_assigned ?? 0);
    metrics.answered = Number(q.answered ?? 0);
    metrics.pendingCount = Number(q.pending ?? 0);
    metrics.avgResponseSeconds =
      q.avg_response != null ? Math.round(Number(q.avg_response)) : null;
    metrics.seenRate = q.seen_rate != null ? Number(q.seen_rate) : null;
  } catch (error) {
    if (!isMissingTable(error, 'student_questions')) throw error;
  }

  try {
    const [recentResp] = await mysqlPool.query(
      `SELECT
         AVG(CASE WHEN sq.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN TIMESTAMPDIFF(SECOND, sq.created_at, COALESCE(sq.answered_at, sq.updated_at)) END) AS recent_avg,
         AVG(CASE WHEN sq.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND sq.created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN TIMESTAMPDIFF(SECOND, sq.created_at, COALESCE(sq.answered_at, sq.updated_at)) END) AS prev_avg
       FROM student_questions sq
       WHERE assigned_teacher_id = ? AND sq.status = 'answered'`,
      [tid]
    );
    metrics.avgResponseRecent =
      recentResp[0]?.recent_avg != null ? Math.round(Number(recentResp[0].recent_avg)) : null;
    metrics.avgResponsePrevious =
      recentResp[0]?.prev_avg != null ? Math.round(Number(recentResp[0].prev_avg)) : null;
  } catch (error) {
    if (!isMissingTable(error, 'student_questions')) throw error;
  }

  try {
    const [actRows] = await mysqlPool.query(
      `SELECT
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS events_7d,
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS events_this_week,
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS events_prev_week,
         COUNT(DISTINCT CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) THEN DATE(created_at) END) AS active_days_14,
         MAX(created_at) AS last_activity
       FROM teacher_activity_logs
       WHERE teacher_id = ?`,
      [tid]
    );
    const a = actRows[0] || {};
    metrics.eventsLast7d = Number(a.events_7d ?? 0);
    metrics.eventsThisWeek = Number(a.events_this_week ?? 0);
    metrics.eventsPrevWeek = Number(a.events_prev_week ?? 0);
    metrics.activeDaysLast14 = Number(a.active_days_14 ?? 0);
    metrics.lastActivityAt = a.last_activity ?? null;
  } catch (error) {
    if (!isMissingTable(error, 'teacher_activity_logs')) throw error;
  }

  return metrics;
}

async function loadTeacherChartData(teacherId) {
  const tid = Number(teacherId);
  const charts = {
    answeredPerDay: [],
    responseTimeTrend: [],
    activityTrend: [],
    subjectWorkload: [],
    monthlyPerformance: [],
  };

  try {
    const [answeredDaily] = await mysqlPool.query(
      `SELECT DATE(answered_at) AS day, COUNT(*) AS count
       FROM student_questions
       WHERE assigned_teacher_id = ?
         AND status = 'answered'
         AND answered_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(answered_at)
       ORDER BY day ASC`,
      [tid]
    );
    charts.answeredPerDay = answeredDaily.map((r) => ({
      date: toDateKey(r.day),
      value: Number(r.count ?? 0),
    }));
  } catch (error) {
    if (!isMissingTable(error, 'student_questions')) throw error;
  }

  try {
    const [respDaily] = await mysqlPool.query(
      `SELECT DATE(answered_at) AS day,
              AVG(TIMESTAMPDIFF(SECOND, created_at, answered_at)) AS avg_seconds
       FROM student_questions
       WHERE assigned_teacher_id = ?
         AND status = 'answered'
         AND answered_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(answered_at)
       ORDER BY day ASC`,
      [tid]
    );
    charts.responseTimeTrend = respDaily.map((r) => ({
      date: toDateKey(r.day),
      value: r.avg_seconds != null ? Math.round(Number(r.avg_seconds)) : 0,
    }));
  } catch (error) {
    if (!isMissingTable(error, 'student_questions')) throw error;
  }

  try {
    const [actDaily] = await mysqlPool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM teacher_activity_logs
       WHERE teacher_id = ?
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [tid]
    );
    charts.activityTrend = actDaily.map((r) => ({
      date: toDateKey(r.day),
      value: Number(r.count ?? 0),
    }));
  } catch (error) {
    if (!isMissingTable(error, 'teacher_activity_logs')) throw error;
  }

  try {
    const [subjects] = await mysqlPool.query(
      `SELECT subject, COUNT(*) AS total,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM student_questions
       WHERE assigned_teacher_id = ?
       GROUP BY subject
       ORDER BY total DESC`,
      [tid]
    );
    charts.subjectWorkload = subjects.map((r) => ({
      subject: r.subject,
      total: Number(r.total ?? 0),
      pending: Number(r.pending ?? 0),
    }));
  } catch (error) {
    if (!isMissingTable(error, 'student_questions')) throw error;
  }

  try {
    const [monthly] = await mysqlPool.query(
      `SELECT DATE_FORMAT(answered_at, '%Y-%m') AS month,
              COUNT(*) AS answered,
              AVG(TIMESTAMPDIFF(SECOND, created_at, answered_at)) AS avg_response
       FROM student_questions
       WHERE assigned_teacher_id = ?
         AND status = 'answered'
         AND answered_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(answered_at, '%Y-%m')
       ORDER BY month ASC`,
      [tid]
    );
    charts.monthlyPerformance = monthly.map((r) => ({
      month: r.month,
      answered: Number(r.answered ?? 0),
      avgResponseSeconds:
        r.avg_response != null ? Math.round(Number(r.avg_response)) : null,
    }));
  } catch (error) {
    if (!isMissingTable(error, 'student_questions')) throw error;
  }

  return charts;
}

/**
 * Leaderboard + insight panel for all teachers.
 */
async function loadInsightsLeaderboard() {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT
         u.id AS teacher_id,
         u.full_name AS teacher_name,
         COUNT(sq.id) AS total_assigned,
         SUM(CASE WHEN sq.status = 'answered' THEN 1 ELSE 0 END) AS answered,
         SUM(CASE WHEN sq.status = 'pending' THEN 1 ELSE 0 END) AS pending,
         AVG(CASE WHEN sq.status = 'answered' THEN TIMESTAMPDIFF(SECOND, sq.created_at, COALESCE(sq.answered_at, sq.updated_at)) END) AS avg_response
       FROM users u
       LEFT JOIN student_questions sq ON sq.assigned_teacher_id = u.id
       WHERE u.role = 'teacher' AND u.status = 'active'
       GROUP BY u.id, u.full_name`
    );

    const teachers = rows.map((r) => ({
      teacherId: Number(r.teacher_id),
      teacherName: r.teacher_name,
      totalAssigned: Number(r.total_assigned ?? 0),
      answered: Number(r.answered ?? 0),
      pending: Number(r.pending ?? 0),
      avgResponseSeconds:
        r.avg_response != null ? Math.round(Number(r.avg_response)) : null,
    }));

    const withActivity = await Promise.all(
      teachers.map(async (t) => {
        let activityScore = 0;
        let lastActivity = null;
        try {
          const [act] = await mysqlPool.query(
            `SELECT
               SUM(CASE WHEN action_type = 'QUESTION_ANSWERED' THEN 10
                        WHEN action_type = 'ANSWER_UPDATED' THEN 5
                        WHEN action_type = 'QUESTION_VIEWED' THEN 1
                        WHEN action_type = 'LOGIN' THEN 2 ELSE 0 END) AS score,
               MAX(created_at) AS last_activity
             FROM teacher_activity_logs
             WHERE teacher_id = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
            [t.teacherId]
          );
          activityScore = Number(act[0]?.score ?? 0);
          lastActivity = act[0]?.last_activity ?? null;
        } catch (error) {
          if (!isMissingTable(error, 'teacher_activity_logs')) throw error;
        }
        return { ...t, activityScore, lastActivity };
      })
    );

    const byActivity = [...withActivity].sort((a, b) => b.activityScore - a.activityScore);
    const bySpeed = [...withActivity]
      .filter((t) => t.avgResponseSeconds != null)
      .sort((a, b) => a.avgResponseSeconds - b.avgResponseSeconds);
    const byWorkload = [...withActivity].sort((a, b) => b.totalAssigned - a.totalAssigned);
    const byPending = [...withActivity].sort((a, b) => b.pending - a.pending);

    return {
      mostActiveTeacher: byActivity[0] ?? null,
      fastestTeacher: bySpeed[0] ?? null,
      highestWorkload: byWorkload[0] ?? null,
      lowestResponseTime: bySpeed[0] ?? null,
      pendingLeaderboard: byPending.slice(0, 10),
      teachers: withActivity,
    };
  } catch (error) {
    if (isMissingTable(error, 'student_questions')) {
      return {
        mostActiveTeacher: null,
        fastestTeacher: null,
        highestWorkload: null,
        lowestResponseTime: null,
        pendingLeaderboard: [],
        teachers: [],
      };
    }
    throw error;
  }
}

/**
 * Full intelligence bundle for a selected teacher.
 */
export async function getTeacherInsightsDetail(teacherId) {
  const tid = Number(teacherId);
  return withTeacherInsightsCache(`detail:${tid}`, async () => {
    const [profile, metrics, charts] = await Promise.all([
      getTeacherForAdmin(tid),
      loadTeacherMetrics(tid),
      loadTeacherChartData(tid),
    ]);

    const health = computeTeacherHealthScore(metrics);
    const alerts = buildTeacherAlerts(tid, metrics);

    return {
      teacher: profile,
      health,
      metrics: {
        avgResponseSeconds: metrics.avgResponseSeconds,
        pendingCount: metrics.pendingCount,
        answered: metrics.answered,
        totalAssigned: metrics.totalAssigned,
        eventsLast7d: metrics.eventsLast7d,
        lastActivityAt: metrics.lastActivityAt,
      },
      charts,
      alerts,
    };
  });
}

/**
 * Overview dashboard (no teacher selected).
 */
export async function getTeacherInsightsOverview() {
  return withTeacherInsightsCache('overview', async () => {
    const leaderboard = await loadInsightsLeaderboard();

    const allAlerts = [];
    for (const t of leaderboard.teachers.slice(0, 50)) {
      const metrics = await loadTeacherMetrics(t.teacherId);
      const alerts = buildTeacherAlerts(t.teacherId, {
        ...metrics,
        lastActivityAt: t.lastActivity ?? metrics.lastActivityAt,
      });
      allAlerts.push(...alerts.map((a) => ({ ...a, teacherName: t.teacherName })));
    }

    const feed = await getTeacherInsightsActivityFeed({ page: 1, limit: 15 });

    return {
      leaderboard,
      alerts: allAlerts.slice(0, 20),
      activityFeed: feed.items,
    };
  }, { ttlMs: 45_000 });
}

export {
  loadTeacherMetrics,
  loadTeacherChartData,
  loadInsightsLeaderboard,
  getTeacherInsightsActivityFeed,
};
