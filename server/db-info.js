import db from './db.js';

async function main() {
  try {
    const [coursesCols] = await db.query("SHOW COLUMNS FROM courses");
    console.log("courses columns:", coursesCols.map(c => `${c.Field} (${c.Type})`));

    const [batchesCols] = await db.query("SHOW COLUMNS FROM course_batches");
    console.log("course_batches columns:", batchesCols.map(c => `${c.Field} (${c.Type})`));
  } catch (e) {
    console.error(e);
  } finally {
    await db.close();
  }
}
main();
