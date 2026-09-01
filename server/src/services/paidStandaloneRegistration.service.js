/**
 * Paid standalone registration + pending order. Never creates a course enrollment.
 */

import { randomInt } from 'crypto';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { parseCreatePaidStandaloneRegistrationDto } from '../dtos/paidStandaloneRegistration.dto.js';
import {
  PAID_STANDALONE_ACCESS_TYPE,
  STANDALONE_ORDER_STATUS,
  STANDALONE_SEAT_STATUS,
} from '../constants/paidStandalone.constants.js';
import { isPaidStandaloneTest } from '../security/cee/paidStandaloneAccess.service.js';
import { countConfirmedStandaloneSeats } from './paidStandaloneApproval.service.js';
import { loadTestSubjectPresentationBatch } from './testSubjectPresentation.service.js';
import { attachStandaloneCatalogStudentState } from './standaloneCatalogStudentState.service.js';
import {
  assertTestAvailabilityWindowForTest,
  AVAILABILITY_PHASE,
  getAvailabilityNowMs,
} from './testAvailabilityWindow.service.js';
import {
  STANDALONE_ACTIVE_CATALOG_WHERE_SQL,
  evaluateStandaloneRuntimeState,
  presentStandaloneCatalogRuntime,
} from './standaloneTestRuntimeState.service.js';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReferenceCode() {
  let code = 'ST-';
  for (let i = 0; i < 8; i += 1) {
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return code;
}

export async function loadPaidStandaloneCatalogTestBySlug(slug) {
  const [rows] = await mysqlPool.query(
    `SELECT id, public_slug, title, description, status, access_mode, test_access_type, course_id,
            price_pkr, seat_capacity, start_date, end_date, duration_minutes
     FROM tests
     WHERE public_slug = ?
       AND test_access_type = ?
       AND course_id IS NULL
       AND status = 'published'
       AND deleted_at IS NULL
     LIMIT 1`,
    [String(slug || '').trim(), PAID_STANDALONE_ACCESS_TYPE]
  );
  return rows[0] ?? null;
}

export async function listPaidStandaloneCatalog({ studentId } = {}) {
  const nowMs = await getAvailabilityNowMs(mysqlPool);
  const [rows] = await mysqlPool.query(
    `SELECT t.id, t.public_slug, t.title, t.description, t.price_pkr, t.seat_capacity,
            t.start_date, t.end_date, t.duration_minutes, t.access_mode,
            t.status, t.test_access_type, t.deleted_at,
            t.max_attempts, t.results_released_at, t.show_result_immediately,
            (
              SELECT COUNT(*)
              FROM standalone_test_orders o
              WHERE o.test_id = t.id
                AND o.status = 'approved'
                AND o.seat_status = 'confirmed'
            ) AS confirmed_seats,
            (
              SELECT COUNT(*)
              FROM test_questions tq
              INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
              WHERE tq.test_id = t.id
            ) AS question_count
     FROM tests t
     WHERE t.test_access_type = ?
       ${STANDALONE_ACTIVE_CATALOG_WHERE_SQL}
     ORDER BY t.id DESC`,
    [PAID_STANDALONE_ACCESS_TYPE]
  );
  const listedRows = rows.filter((row) => evaluateStandaloneRuntimeState(row, nowMs).listedInActiveCatalog);
  const presentationByTestId = await loadTestSubjectPresentationBatch(
    listedRows.map((row) => Number(row.id))
  );
  const items = listedRows.map((row) => {
    const capacity = Number(row.seat_capacity || 0);
    const confirmed = Number(row.confirmed_seats || 0);
    const presentation = presentationByTestId.get(Number(row.id));
    const runtime = presentStandaloneCatalogRuntime(row, nowMs);
    return {
      slug: String(row.public_slug),
      title: String(row.title || ''),
      description: row.description ? String(row.description) : null,
      subject: presentation?.displayLabel || null,
      pricePkr: Number(row.price_pkr),
      seatCapacity: capacity,
      seatsRemaining: Math.max(0, capacity - confirmed),
      questionCount: Number(row.question_count || 0),
      durationMinutes: Number(row.duration_minutes || 0),
      startDate: runtime.startDate,
      endDate: runtime.endDate,
      examOpen: runtime.examOpen,
      listingStatus: runtime.listingStatus,
      schedulePhase: runtime.schedulePhase,
    };
  });
  return attachStandaloneCatalogStudentState(items, listedRows, { studentId, kind: 'paid' });
}

/**
 * @param {{ slug: string, userId: number, body: unknown }}
 */
export async function registerPaidStandaloneTest({ slug, userId, body }) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  const fields = parseCreatePaidStandaloneRegistrationDto(body);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [testRows] = await connection.query(
      `SELECT id, public_slug, title, status, test_access_type, course_id, price_pkr, seat_capacity,
              start_date, end_date, deleted_at
       FROM tests
       WHERE public_slug = ?
       FOR UPDATE`,
      [String(slug || '').trim()]
    );
    const test = testRows[0];
    if (!test || !isPaidStandaloneTest(test) || test.course_id != null || test.deleted_at) {
      throw new ApiError(404, 'Test not found', { code: 'TEST_NOT_FOUND' });
    }
    if (String(test.status) !== 'published') {
      throw new ApiError(404, 'Test not found', { code: 'TEST_NOT_FOUND' });
    }

    const nowMs = await getAvailabilityNowMs(connection);
    assertTestAvailabilityWindowForTest(test, {
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs,
      context: 'registerPaidStandaloneTest',
    });

    const price = Number(test.price_pkr);
    if (!Number.isInteger(price) || price < 1) {
      throw new ApiError(409, 'This test is not available for purchase', { code: 'PRICE_NOT_SET' });
    }

    const [existingReg] = await connection.query(
      `SELECT id FROM standalone_test_registrations WHERE test_id = ? AND user_id = ? LIMIT 1`,
      [test.id, uid]
    );
    if (existingReg[0]) {
      const [openOrder] = await connection.query(
        `SELECT id, status, amount, reference_code
         FROM standalone_test_orders
         WHERE test_id = ? AND user_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [test.id, uid]
      );
      const order = openOrder[0];
      if (order && String(order.status) === STANDALONE_ORDER_STATUS.APPROVED) {
        throw new ApiError(409, 'You are already registered for this test', {
          code: 'DUPLICATE_REGISTRATION',
        });
      }
      if (
        order &&
        (String(order.status) === STANDALONE_ORDER_STATUS.PENDING ||
          String(order.status) === STANDALONE_ORDER_STATUS.UNDER_REVIEW)
      ) {
        await connection.commit();
        return {
          registrationId: Number(existingReg[0].id),
          orderId: Number(order.id),
          amount: Number(order.amount),
          status: String(order.status),
          referenceCode: order.reference_code ? String(order.reference_code) : null,
          duplicate: true,
        };
      }
      throw new ApiError(409, 'You already have a registration for this test', {
        code: 'DUPLICATE_REGISTRATION',
      });
    }

    const capacity = Number(test.seat_capacity);
    if (Number.isInteger(capacity) && capacity > 0) {
      const confirmed = await countConfirmedStandaloneSeats(connection, Number(test.id));
      if (confirmed >= capacity) {
        throw new ApiError(409, 'All seats for this test are already confirmed', {
          code: 'CAPACITY_REACHED',
        });
      }
    }

    const [regResult] = await connection.query(
      `INSERT INTO standalone_test_registrations (
         test_id, user_id, applicant_full_name, father_name, date_of_birth, gender,
         whatsapp_number, email, province_id, district_id, city_id, board_id,
         hssc_status, mdcat_attempt_type
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        test.id,
        uid,
        fields.applicantFullName,
        fields.fatherName,
        fields.dateOfBirth ?? null,
        fields.gender,
        fields.whatsappNumber,
        fields.email,
        fields.province_id,
        fields.district_id,
        fields.city_id,
        fields.board_id ?? null,
        fields.hsscStatus,
        fields.mdcatAttemptType,
      ]
    );

    let referenceCode = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateReferenceCode();
      try {
        const [orderResult] = await connection.query(
          `INSERT INTO standalone_test_orders (
             test_id, user_id, registration_id, amount, currency, status, seat_status, reference_code
           ) VALUES (?, ?, ?, ?, 'PKR', ?, ?, ?)`,
          [
            test.id,
            uid,
            regResult.insertId,
            price,
            STANDALONE_ORDER_STATUS.PENDING,
            STANDALONE_SEAT_STATUS.NONE,
            code,
          ]
        );
        referenceCode = code;
        await connection.commit();
        return {
          registrationId: Number(regResult.insertId),
          orderId: Number(orderResult.insertId),
          amount: price,
          status: STANDALONE_ORDER_STATUS.PENDING,
          referenceCode,
          duplicate: false,
        };
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
      }
    }
    throw new ApiError(500, 'Could not allocate a payment reference code');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
