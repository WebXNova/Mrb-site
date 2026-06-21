import { mysqlPool } from '../config/mysql.js';
import { TEACHER_ACTIVITY_ACTIONS } from '../constants/teacherActivity.schema.js';
import { ALERT_TYPES } from '../constants/teacherInsights.schema.js';

function isMissingTable(error, table) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes(table);
}

function daysSince(date) {
  if (!date) return Infinity;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / 86400000;
}

/**
 * @param {number} teacherId
 * @param {{
 *   lastActivityAt?: string|null,
 *   pendingCount?: number,
 *   avgResponseRecent?: number|null,
 *   avgResponsePrevious?: number|null,
 *   eventsThisWeek?: number,
 *   eventsPrevWeek?: number,
 * }} ctx
 */
export function buildTeacherAlerts(teacherId, ctx) {
  const alerts = [];
  const tid = Number(teacherId);

  if (daysSince(ctx.lastActivityAt) >= 3) {
    alerts.push({
      type: ALERT_TYPES.INACTIVE,
      severity: 'warning',
      teacherId: tid,
      message: 'No activity for 3+ days',
      detail: ctx.lastActivityAt
        ? `Last seen ${Math.floor(daysSince(ctx.lastActivityAt))} days ago`
        : 'No recorded activity',
    });
  }

  const pending = Number(ctx.pendingCount) || 0;
  if (pending >= 10) {
    alerts.push({
      type: ALERT_TYPES.HIGH_PENDING,
      severity: pending >= 20 ? 'critical' : 'warning',
      teacherId: tid,
      message: `${pending} pending questions`,
      detail: 'Workload may require attention',
    });
  }

  const recent = ctx.avgResponseRecent;
  const previous = ctx.avgResponsePrevious;
  if (
    recent != null &&
    previous != null &&
    previous > 0 &&
    recent > previous * 1.5 &&
    recent > 3600
  ) {
    alerts.push({
      type: ALERT_TYPES.SLOW_RESPONSE_TREND,
      severity: 'warning',
      teacherId: tid,
      message: 'Response times slowing down',
      detail: 'Average response time increased significantly this week',
    });
  }

  const thisWeek = Number(ctx.eventsThisWeek) || 0;
  const prevWeek = Number(ctx.eventsPrevWeek) || 0;
  if (prevWeek >= 5 && thisWeek < prevWeek * 0.5) {
    alerts.push({
      type: ALERT_TYPES.ACTIVITY_DROP,
      severity: 'warning',
      teacherId: tid,
      message: 'Sudden activity drop',
      detail: `Activity down ${Math.round((1 - thisWeek / prevWeek) * 100)}% vs last week`,
    });
  }

  return alerts;
}

const ACTION_MESSAGES = {
  [TEACHER_ACTIVITY_ACTIONS.QUESTION_ANSWERED]: 'answered Question',
  [TEACHER_ACTIVITY_ACTIONS.QUESTION_VIEWED]: 'viewed Question',
  [TEACHER_ACTIVITY_ACTIONS.ANSWER_UPDATED]: 'updated Answer',
  [TEACHER_ACTIVITY_ACTIONS.LOGIN]: 'logged in',
  [TEACHER_ACTIVITY_ACTIONS.LOGOUT]: 'logged out',
};

function formatFeedMessage(row) {
  const name = row.teacher_name || `Teacher #${row.teacher_id}`;
  const action = row.action_type;
  const template = ACTION_MESSAGES[action] || action;
  const qid = row.question_id;
  const suffix = qid && action !== TEACHER_ACTIVITY_ACTIONS.LOGIN && action !== TEACHER_ACTIVITY_ACTIONS.LOGOUT
    ? ` #${qid}`
    : '';
  return `Teacher ${name} ${template}${suffix}`;
}

function parseMeta(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapFeedRow(row) {
  return {
    id: Number(row.id),
    teacherId: Number(row.teacher_id),
    teacherName: row.teacher_name ?? null,
    questionId: row.question_id != null ? Number(row.question_id) : null,
    actionType: row.action_type,
    message: formatFeedMessage(row),
    metadata: parseMeta(row.metadata_json),
    createdAt: row.created_at,
  };
}

/**
 * Live activity stream for admin insights.
 */
export async function getTeacherInsightsActivityFeed({ teacherId, page = 1, limit = 25 } = {}) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '1=1';

  if (teacherId) {
    where += ' AND tal.teacher_id = ?';
    params.push(Number(teacherId));
  }

  try {
    const [countRows] = await mysqlPool.query(
      `SELECT COUNT(*) AS total FROM teacher_activity_logs tal WHERE ${where}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await mysqlPool.query(
      `SELECT tal.*, u.full_name AS teacher_name
       FROM teacher_activity_logs tal
       INNER JOIN users u ON u.id = tal.teacher_id
       WHERE ${where}
       ORDER BY tal.created_at DESC, tal.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: rows.map(mapFeedRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  } catch (error) {
    if (isMissingTable(error, 'teacher_activity_logs')) {
      return { items: [], pagination: { page, limit, total: 0, totalPages: 1 } };
    }
    throw error;
  }
}

export { formatFeedMessage, mapFeedRow };
