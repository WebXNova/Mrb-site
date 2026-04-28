import { mysqlPool } from '../config/mysql.js';

function toCourse(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subject: row.subject,
    description: row.description,
    price: row.price,
    originalPrice: row.original_price,
    accentColor: row.accent_color,
    level: row.level,
    instructor: row.instructor,
    lecturesCount: row.lectures_count,
    testsCount: row.tests_count,
    durationWeeks: row.duration_weeks,
    rating: Number(row.rating || 0),
    studentsEnrolled: row.students_enrolled,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCourses() {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM courses ORDER BY created_at DESC`
  );
  return rows.map(toCourse);
}

export async function createCourse(payload, createdBy = null) {
  const [result] = await mysqlPool.query(
    `INSERT INTO courses
     (slug, title, subject, description, price, original_price, accent_color, level, instructor,
      lectures_count, tests_count, duration_weeks, rating, students_enrolled, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.slug,
      payload.title,
      payload.subject,
      payload.description,
      payload.price,
      payload.originalPrice || null,
      payload.accentColor || null,
      payload.level || null,
      payload.instructor || null,
      payload.lecturesCount || '0',
      payload.testsCount || '0',
      payload.durationWeeks || 0,
      payload.rating || 0,
      payload.studentsEnrolled || 0,
      payload.isActive ?? true,
      createdBy,
    ]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM courses WHERE id = ?`, [result.insertId]);
  return toCourse(rows[0]);
}

export async function updateCourse(courseId, payload) {
  await mysqlPool.query(
    `UPDATE courses
     SET title = ?, subject = ?, description = ?, price = ?, original_price = ?, accent_color = ?,
         level = ?, instructor = ?, lectures_count = ?, tests_count = ?, duration_weeks = ?,
         rating = ?, students_enrolled = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.title,
      payload.subject,
      payload.description,
      payload.price,
      payload.originalPrice || null,
      payload.accentColor || null,
      payload.level || null,
      payload.instructor || null,
      payload.lecturesCount || '0',
      payload.testsCount || '0',
      payload.durationWeeks || 0,
      payload.rating || 0,
      payload.studentsEnrolled || 0,
      payload.isActive ?? true,
      courseId,
    ]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM courses WHERE id = ?`, [courseId]);
  return rows[0] ? toCourse(rows[0]) : null;
}

export async function deleteCourse(courseId) {
  const [result] = await mysqlPool.query(`DELETE FROM courses WHERE id = ?`, [courseId]);
  return result.affectedRows > 0;
}
