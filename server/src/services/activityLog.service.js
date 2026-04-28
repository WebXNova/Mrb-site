import { ActivityLog } from '../models/activityLog.model.js';

export async function logActivity({
  userId = null,
  role = 'system',
  action,
  entityType,
  entityId = null,
  metadata = {},
}) {
  try {
    await ActivityLog.create({
      userId,
      role,
      action,
      entityType,
      entityId,
      metadata,
    });
  } catch (error) {
    // Swallow logging failures to avoid blocking primary flow.
    console.error('ActivityLog error:', error.message);
  }
}
