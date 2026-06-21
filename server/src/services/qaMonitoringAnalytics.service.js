import { mysqlPool } from '../config/mysql.js';
import { TEACHER_ACTIVITY_SCORE_WEIGHTS } from '../constants/teacherActivity.schema.js';

function buildQuestionStatsWhere(filters) {
  const clauses = ['1=1'];
  const params = [];

  if (filters.teacherId) {
    clauses.push('sq.assigned_teacher_id = ?');
    params.push(filters.teacherId);
  }
  if (filters.courseId) {
    clauses.push('sq.course_id = ?');
    params.push(filters.courseId);
  }
  if (filters.dateFrom) {
    clauses.push('sq.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    clauses.push('sq.created_at <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  return { where: clauses.join(' AND '), params };
}

function buildActivityStatsWhere(filters) {
  const clauses = ['1=1'];
  const params = [];

  if (filters.teacherId) {
    clauses.push('tal.teacher_id = ?');
    params.push(filters.teacherId);
  }
  if (filters.dateFrom) {
    clauses.push('tal.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    clauses.push('tal.created_at <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  return { where: clauses.join(' AND '), params };
}

function isMissingTable(error, table) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes(table);
}

function emptyStats() {
  return {
    totalQuestions: 0,
    totalAnswered: 0,
    totalPending: 0,
    averageResponseTimeSeconds: null,
    activityScore: null,
    lastActivity: null,
    teacherActivityScores: [],
    mostActiveTeacher: null,
    leastActiveTeacher: null,
  };
}

/**
 * Compute Q&A monitoring analytics for admin dashboard.
 */
export async function getQaMonitoringStatistics(filters = {}) {
  const { where: qWhere, params: qParams } = buildQuestionStatsWhere(filters);
  const { where: aWhere, params: aParams } = buildActivityStatsWhere(filters);

  try {
    const [countRows] = await mysqlPool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN sq.status = 'answered' THEN 1 ELSE 0 END) AS answered,
         SUM(CASE WHEN sq.status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM student_questions sq
       WHERE ${qWhere}`,
      qParams
    );

    const totalQuestions = Number(countRows[0]?.total ?? 0);
    const totalAnswered = Number(countRows[0]?.answered ?? 0);
    const totalPending = Number(countRows[0]?.pending ?? 0);

    const [responseRows] = await mysqlPool.query(
      `SELECT
         AVG(TIMESTAMPDIFF(SECOND, sq.created_at, COALESCE(ta.created_at, sq.answered_at))) AS avg_seconds
       FROM student_questions sq
       LEFT JOIN teacher_answers ta ON ta.question_id = sq.id
       WHERE ${qWhere}
         AND sq.status = 'answered'`,
      qParams
    );
    const avgRaw = responseRows[0]?.avg_seconds;
    const averageResponseTimeSeconds =
      avgRaw != null && !Number.isNaN(Number(avgRaw)) ? Math.round(Number(avgRaw)) : null;

    const scoreCase = Object.entries(TEACHER_ACTIVITY_SCORE_WEIGHTS)
      .map(([action, weight]) => `SUM(CASE WHEN tal.action_type = '${action}' THEN ${weight} ELSE 0 END)`)
      .join(' + ');

    let activityRows = [];
    try {
      [activityRows] = await mysqlPool.query(
        `SELECT
           tal.teacher_id,
           u.full_name AS teacher_name,
           COUNT(*) AS event_count,
           (${scoreCase}) AS activity_score
         FROM teacher_activity_logs tal
         INNER JOIN users u ON u.id = tal.teacher_id
         WHERE ${aWhere}
         GROUP BY tal.teacher_id, u.full_name
         ORDER BY activity_score DESC, event_count DESC`,
        aParams
      );
    } catch (error) {
      if (!isMissingTable(error, 'teacher_activity_logs')) throw error;
    }

    const teacherActivityScores = activityRows.map((row) => ({
      teacherId: Number(row.teacher_id),
      teacherName: row.teacher_name ?? null,
      eventCount: Number(row.event_count ?? 0),
      activityScore: Number(row.activity_score ?? 0),
    }));

    const ranked = teacherActivityScores.filter((t) => t.activityScore > 0 || t.eventCount > 0);
    const mostActiveTeacher = ranked[0] ?? null;
    const leastActiveTeacher = ranked.length > 1 ? ranked[ranked.length - 1] : null;

    let activityScore = null;
    let lastActivity = null;

    if (filters.teacherId) {
      const match = teacherActivityScores.find((t) => t.teacherId === Number(filters.teacherId));
      activityScore = match?.activityScore ?? 0;

      try {
        const [lastRows] = await mysqlPool.query(
          `SELECT MAX(created_at) AS last_activity
           FROM teacher_activity_logs
           WHERE teacher_id = ?`,
          [filters.teacherId]
        );
        lastActivity = lastRows[0]?.last_activity ?? null;
      } catch (error) {
        if (!isMissingTable(error, 'teacher_activity_logs')) throw error;
      }
    } else {
      activityScore = mostActiveTeacher?.activityScore ?? null;
      try {
        const [lastRows] = await mysqlPool.query(
          `SELECT MAX(created_at) AS last_activity FROM teacher_activity_logs`
        );
        lastActivity = lastRows[0]?.last_activity ?? null;
      } catch (error) {
        if (!isMissingTable(error, 'teacher_activity_logs')) throw error;
      }
    }

    return {
      totalQuestions,
      totalAnswered,
      totalPending,
      averageResponseTimeSeconds,
      activityScore,
      lastActivity,
      teacherActivityScores,
      mostActiveTeacher,
      leastActiveTeacher,
    };
  } catch (error) {
    if (isMissingTable(error, 'student_questions')) {
      return emptyStats();
    }
    throw error;
  }
}
