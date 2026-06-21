import assert from 'node:assert/strict';
import {
  enrollmentToSourceFields,
  normalizeFieldsForForm,
} from '../services/enrollmentPrefill.service.js';
import {
  mapEnrollmentFieldsToTargetForm,
  resetFieldMappingConfigCache,
} from '../services/enrollmentFieldMapping.service.js';

console.log('enrollmentPrefill.service tests\n');

resetFieldMappingConfigCache();

const sampleEnrollment = {
  id: 10,
  userId: 1,
  courseId: 5,
  orderId: 99,
  orderGatewayRef: 'gw_secret_ref',
  applicantFullName: 'Ali Khan',
  fatherName: 'Ahmed Khan',
  email: 'ali@example.com',
  whatsappNumber: '+923001234567',
  provinceId: 1,
  districtId: 2,
  cityId: 3,
  boardId: 4,
  gender: 'male',
  hsscStatus: 'Inter Class',
  mdcatAttemptType: 'Fresher',
};

const sourceFields = enrollmentToSourceFields(sampleEnrollment);
assert.equal(sourceFields.orderId, undefined, 'payment fields excluded from source');
assert.equal(sourceFields.applicantFullName, 'Ali Khan');

const { mapped } = await mapEnrollmentFieldsToTargetForm(sourceFields, {
  sourceCourseId: 5,
  targetCourseId: 8,
});
assert.equal(mapped.province_id, 1, 'provinceId maps to province_id');
assert.equal(mapped.applicantFullName, 'Ali Khan');

const normalized = normalizeFieldsForForm({
  province_id: 1,
  board_id: 4,
  dateOfBirth: null,
});
assert.equal(normalized.province_id, '1');
assert.equal(normalized.dateOfBirth, '');

console.log('OK — enrollment prefill mapping');
