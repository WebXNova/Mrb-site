import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { toCourseAdminDto } from '../dto/course.dto.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { insertActiveCoursePricingWithConnection } from './coursePricing.service.js';
import { insertCurriculumSeedsForNewCourse } from './courseCurriculumSeed.service.js';
import { insertCourseBatchWithConnection } from './courseBatch.service.js';
import { StructuredLogger, createTransactionId } from '../utils/requestId.js';
import {
  resolveWizardPublishState,
  validatePublishStateInvariants,
  generatePublishAuditMetadata,
} from './courseWizardPublishState.service.js';

function isDupEntry(err) {
  return err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
}

/**
 * Transactional course + pricing + batches + subjects (wizard create).
 * 
 * CRITICAL: This is a single atomic transaction.
 * If ANY step fails, ALL changes are rolled back.
 * No partial writes, no orphan rows.
 * 
 * STATE CONSISTENCY: Uses centralized state resolver to ensure:
 * - publish=true → course MUST be active
 * - inactive course → NO active batches/pricing
 * - published course → active pricing + batches required
 *
 * @param {object} payload validated wizard body (`courseWizardBodySchema`)
 * @param {number|null} actorUserId
 * @param {object} options - { requestId }
 */
export async function createCourseWizardTransaction(payload, actorUserId = null, options = {}) {
  const transactionId = createTransactionId();
  const requestId = options.requestId || 'unknown';
  
  const logger = new StructuredLogger({ 
    transactionId, 
    requestId,
    service: 'courseWizard',
  });

  // STEP 0: Resolve publish state with enforced invariants
  logger.debug('Resolving publish state');
  const resolved = resolveWizardPublishState(payload);
  
  // STEP 0.1: Validate domain invariants BEFORE transaction
  logger.debug('Validating domain invariants');
  validatePublishStateInvariants(payload, resolved);
  
  // Generate audit metadata
  const auditMetadata = generatePublishAuditMetadata(resolved);
  
  logger.info('Starting course wizard transaction', {
    ...auditMetadata,
    subjectCount: payload.subjects.length,
  });

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    logger.debug('Transaction started');

    // Step 1: Create course with RESOLVED active state
    logger.debug('Creating course record', { courseActive: resolved.courseActive });
    const [result] = await connection.query(
      `INSERT INTO courses
       (title, description, short_description, level, image_url, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.course.title,
        payload.course.description,
        payload.course.short_description ?? null,
        payload.course.level,
        payload.course.thumbnail_url ?? null,
        resolved.courseActive, // Use resolved state, not payload
        actorUserId,
      ]
    );
    const newCourseId = result.insertId;
    logger.info('Course created', { courseId: newCourseId, isActive: resolved.courseActive });

    // Step 2: Create pricing with RESOLVED active state
    logger.debug('Creating course pricing', { pricingActive: resolved.pricingActive });
    const pricingWithResolvedState = {
      ...payload.pricing,
      is_active: resolved.pricingActive,
    };
    await insertActiveCoursePricingWithConnection(connection, newCourseId, pricingWithResolvedState, actorUserId);
    logger.debug('Pricing created', { isActive: resolved.pricingActive });

    // Step 3: Create batches with RESOLVED states
    logger.debug('Creating batches', { 
      count: resolved.batches.length,
      activeBatches: resolved.batches.filter(b => b.is_active !== false).length,
    });
    for (let i = 0; i < resolved.batches.length; i++) {
      const batch = resolved.batches[i];
      await insertCourseBatchWithConnection(connection, newCourseId, batch, actorUserId);
      logger.debug('Batch created', { 
        batchIndex: i, 
        status: batch.status,
        isActive: batch.is_active,
      });
    }

    // Step 4: Create subjects
    logger.debug('Creating subjects', { count: payload.subjects.length });
    const sortedSubjects = [...payload.subjects].sort((a, b) => a.order_index - b.order_index);
    await insertCurriculumSeedsForNewCourse(connection, newCourseId, sortedSubjects);
    logger.debug('Subjects created');

    // Commit transaction
    await connection.commit();
    logger.info('Transaction committed successfully', { courseId: newCourseId });

    const row = await getCourseRowById(newCourseId);
    return toCourseAdminDto(row);
  } catch (e) {
    logger.error('Transaction failed, rolling back', {
      error: e.message,
      code: e.code,
      errno: e.errno,
    });

    try {
      await connection.rollback();
      logger.info('Transaction rolled back successfully');
    } catch (rbError) {
      logger.error('Rollback failed', {
        error: rbError.message,
      });
    }

    // Classify the error for better client handling
    if (isDupEntry(e)) {
      const errorMessage = String(e.message || '').toLowerCase();
      
      // Check what constraint was violated
      if (errorMessage.includes('uq_course_batch_course_code')) {
        throw new ApiError(409, 'A batch with this code already exists in this course', {
          code: 'BATCH_CODE_EXISTS',
        });
      }
      if (errorMessage.includes('courses.title') || errorMessage.includes('uq_courses_title')) {
        throw new ApiError(409, 'A course with this title already exists', {
          code: 'COURSE_TITLE_EXISTS',
        });
      }
      if (errorMessage.includes('courses.slug') || errorMessage.includes('uq_courses_slug')) {
        throw new ApiError(409, 'A course with this slug already exists', {
          code: 'COURSE_SLUG_EXISTS',
        });
      }
      
      // Generic duplicate entry
      throw new ApiError(409, 'A duplicate entry conflict occurred', {
        code: 'DUPLICATE_ENTRY',
      });
    }

    throw e;
  } finally {
    connection.release();
  }
}
