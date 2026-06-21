#!/usr/bin/env node
/**
 * Teacher inbox / thread performance benchmark — query count model + optional live DB timing.
 *
 * Usage:
 *   node scripts/benchmark-teacher-inbox-performance.mjs
 *   node scripts/benchmark-teacher-inbox-performance.mjs --live
 */
import 'dotenv/config';
import { performance } from 'perf_hooks';
import { mysqlPool } from '../src/config/mysql.js';
import { openTeacherQuestionThread } from '../src/services/teacherQuestionThreads.service.js';
import { listTeacherQuestionThreads } from '../src/services/teacherQuestionThreads.service.js';
import { resolveStudentUserIdFromThreadId } from '../src/services/teacherQuestionThreadRef.js';
import { buildTeacherQuestionThreadId } from '../src/services/teacherQuestionThreadRef.js';

const live = process.argv.includes('--live');

const BEFORE = {
  openThread(unreadCount) {
    // assertTeacher + resolve(distinct all students) + txn + SELECT FOR UPDATE + N UPDATEs + commit
    return 2 + 3 + unreadCount;
  },
  resolveThread(studentCount) {
    // 1 DISTINCT query (full student scan) — HMAC is CPU, not SQL
    return 1;
  },
  listThreads() {
    // assert + COUNT(subquery aggregate) + list aggregate + summary
    return 4;
  },
};

const AFTER = {
  openThread(unreadCount) {
    return 2 + 3 + 1; // set-based single UPDATE regardless of N
  },
  resolveThread() {
    return 1; // indexed lookup on (assigned_teacher_id, teacher_thread_ref)
  },
  listThreads() {
    return 4; // same query count; COUNT DISTINCT + join-based latest row (cheaper plans)
  },
};

function printQueryModel() {
  const unreadSamples = [1, 50, 500, 2000];
  console.log('=== Query count model (teacher domain) ===\n');

  console.log('openTeacherQuestionThread (per request, inside transaction):');
  console.log('  baseline overhead: assertTeacher(1) + resolveThread(1) + BEGIN + SELECT FOR UPDATE + COMMIT = 5');
  console.log('');
  console.log('| Unread messages | BEFORE (per-row UPDATE) | AFTER (set-based UPDATE) | Reduction |');
  console.log('|-----------------|-------------------------|--------------------------|-----------|');
  for (const n of unreadSamples) {
    const before = BEFORE.openThread(n);
    const after = AFTER.openThread(n);
    console.log(
      `| ${String(n).padStart(15)} | ${String(before).padStart(23)} | ${String(after).padStart(24)} | ${String(before - after).padStart(9)} |`
    );
  }

  console.log('\nresolveStudentUserIdFromThreadId:');
  console.log('  BEFORE: SELECT DISTINCT user_id (all assigned students) + O(students) HMAC in Node');
  console.log('  AFTER:  SELECT user_id ... WHERE assigned_teacher_id=? AND teacher_thread_ref=? LIMIT 1');
  console.log('  SQL queries: 1 → 1 (same count, index seek vs full distinct scan at 10k+ questions)\n');

  console.log('listTeacherQuestionThreads (per page):');
  console.log('  BEFORE COUNT: SELECT COUNT(*) FROM (full GROUP BY aggregate subquery)');
  console.log('  AFTER COUNT:  SELECT COUNT(DISTINCT sq.user_id) with same filters');
  console.log('  BEFORE list:  GROUP_CONCAT(body, course, subject) per thread row');
  console.log('  AFTER list:   GROUP_CONCAT(id) only + JOIN latest row for body/course/subject');
  console.log(`  SQL queries: ${BEFORE.listThreads()} → ${AFTER.listThreads()} (count unchanged; plan cost reduced)\n`);

  const atScale = 10_000;
  const avgUnreadPerThread = 20;
  console.log(`At ${atScale.toLocaleString()} questions (~500 students, ~20 msgs/thread):`);
  console.log(
    `  Thread open worst-case BEFORE: ~${BEFORE.openThread(avgUnreadPerThread)} queries`
  );
  console.log(
    `  Thread open worst-case AFTER:  ~${AFTER.openThread(avgUnreadPerThread)} queries`
  );
  console.log(
    `  Savings per thread open:       ~${BEFORE.openThread(avgUnreadPerThread) - AFTER.openThread(avgUnreadPerThread)} queries`
  );
}

async function runLiveBenchmark() {
  console.log('\n=== Live benchmark (requires DB + seed data) ===\n');

  const queryLog = [];
  const originalQuery = mysqlPool.query.bind(mysqlPool);
  mysqlPool.query = async (...args) => {
    queryLog.push(String(args[0]).replace(/\s+/g, ' ').trim().slice(0, 120));
    return originalQuery(...args);
  };

  const [teachers] = await mysqlPool.query(
    `SELECT assigned_teacher_id AS teacher_id, user_id, COUNT(*) AS n
     FROM student_questions
     WHERE assigned_teacher_id IS NOT NULL
     GROUP BY assigned_teacher_id, user_id
     ORDER BY n DESC
     LIMIT 1`
  );

  if (!teachers[0]) {
    console.log('No student_questions data — skipping live timing.');
    return;
  }

  const teacherId = teachers[0].teacher_id;
  const studentUserId = teachers[0].user_id;
  const threadId = buildTeacherQuestionThreadId(teacherId, studentUserId);

  queryLog.length = 0;
  const t0 = performance.now();
  await resolveStudentUserIdFromThreadId(mysqlPool, teacherId, threadId);
  const resolveMs = performance.now() - t0;
  const resolveQueries = queryLog.length;

  queryLog.length = 0;
  const t1 = performance.now();
  await listTeacherQuestionThreads(teacherId, { page: 1, limit: 20 });
  const listMs = performance.now() - t1;
  const listQueries = queryLog.length;

  queryLog.length = 0;
  const t2 = performance.now();
  await openTeacherQuestionThread(teacherId, threadId);
  const openMs = performance.now() - t2;
  const openQueries = queryLog.length;

  console.log('| Operation | Queries | ms |');
  console.log('|-----------|---------|-----|');
  console.log(`| resolveThreadId | ${resolveQueries} | ${resolveMs.toFixed(1)} |`);
  console.log(`| listThreads p1 | ${listQueries} | ${listMs.toFixed(1)} |`);
  console.log(`| openThread | ${openQueries} | ${openMs.toFixed(1)} |`);
}

async function main() {
  printQueryModel();
  if (live) {
    await runLiveBenchmark();
  } else {
    console.log('Run with --live to measure against your database (optional).');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (live) {
      try {
        await mysqlPool.end();
      } catch {
        /* ignore */
      }
    }
  });
