/**
 * Verify PUT reject endpoint (backend sanity check).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { mysqlPool } from '../src/config/mysql.js';
import { insertManualPaymentForTests, deleteManualPaymentsForTests } from '../src/services/manualPayments.service.js';
import { rejectManualPaymentSubmission } from '../src/services/manualPaymentReview.service.js';

const [[admin]] = await mysqlPool.query(
  `SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY id ASC LIMIT 1`
);
const [[student]] = await mysqlPool.query(`SELECT id FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 1`);
const [[template]] = await mysqlPool.query(`SELECT * FROM enrollments ORDER BY id DESC LIMIT 1`);
const [courses] = await mysqlPool.query(`SELECT id FROM courses ORDER BY id ASC LIMIT 1`);
if (!admin || !student || !template || !courses[0]) {
  console.error('missing seed data');
  process.exit(1);
}

const stamp = Date.now();
const [enR] = await mysqlPool.query(
  `INSERT INTO enrollments (user_id, course_id, email, status, access_status, enrollment_source, province_id, district_id, city_id, applicant_full_name, father_name, gender, whatsapp_number, hssc_status, mdcat_attempt_type)
   VALUES (?, ?, ?, 'pending', 'inactive', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    student.id,
    courses[0].id,
    `rej-test-${stamp}@test.com`,
    template.province_id,
    template.district_id,
    template.city_id,
    template.applicant_full_name || 'Test',
    template.father_name || 'Test',
    template.gender || 'male',
    template.whatsapp_number || '03001234567',
    template.hssc_status || 'completed',
    template.mdcat_attempt_type || 'first',
  ]
);
const enrollmentId = Number(enR.insertId);
const [ordR] = await mysqlPool.query(
  `INSERT INTO orders (user_id, course_id, enrollment_id, gateway, amount, currency, status) VALUES (?, ?, ?, 'manual', 5000, 'PKR', 'pending')`,
  [student.id, courses[0].id, enrollmentId]
);
const orderId = Number(ordR.insertId);
const pid = await insertManualPaymentForTests({
  orderId,
  enrollmentId,
  studentId: student.id,
  paymentMethod: 'easypaisa',
  senderPhone: '03001234567',
  senderTitle: 'Reject Test',
  transactionId: `REJTEST${stamp}`,
  amountClaimed: 5000,
  status: 'pending_review',
  riskLevel: 'low',
});

const rejected = await rejectManualPaymentSubmission({
  submissionId: pid,
  actorId: Number(admin.id),
  actorRole: 'admin',
  adminNote: 'Screenshot unclear — please resubmit.',
});
console.log('service reject OK:', rejected.status, rejected.adminNote);

await deleteManualPaymentsForTests([pid]);
await mysqlPool.query(`DELETE FROM orders WHERE id = ?`, [orderId]);
await mysqlPool.query(`DELETE FROM enrollments WHERE id = ?`, [enrollmentId]);
await mysqlPool.end();
