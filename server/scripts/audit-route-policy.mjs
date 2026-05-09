import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesDir = path.resolve(__dirname, '../src/routes');

function isProtectedRoute(fileName, routePath) {
  if (fileName === 'admin.routes.js') return true;
  if (fileName === 'student.routes.js') return true;
  if (fileName === 'tests.routes.js' && routePath.includes('/verify-code')) return true;
  if (fileName === 'auth.routes.js') {
    return ['/logout', '/logout-all', '/refresh', '/student/logout', '/student/verify-mrb-enrollment', '/student/me'].includes(
      routePath
    );
  }
  return false;
}

function hasPolicyProtection(line) {
  return line.includes('enforcePolicy(') || line.includes('requireAdmin') || line.includes('requireStudentVerified');
}

async function auditFile(fileName) {
  const source = await fs.readFile(path.join(routesDir, fileName), 'utf8');
  const lines = source.split('\n');
  const hasGlobalPolicy =
    source.includes('router.use(enforcePolicy(') || source.includes('router.use(requireAdmin)') || source.includes('router.use(requireStudent)');
  const violations = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('router.')) continue;
    const match = trimmed.match(/router\.(get|post|put|patch|delete)\('([^']+)'/);
    if (!match) continue;
    const routePath = match[2];
    if (!isProtectedRoute(fileName, routePath)) continue;
    if (hasGlobalPolicy && (fileName === 'admin.routes.js' || fileName === 'student.routes.js')) continue;
    if (!hasPolicyProtection(trimmed)) {
      violations.push(`${fileName}:${routePath}`);
    }
  }
  return violations;
}

async function main() {
  const files = ['auth.routes.js', 'admin.routes.js', 'student.routes.js', 'tests.routes.js'];
  const allViolations = [];
  for (const fileName of files) {
    const violations = await auditFile(fileName);
    allViolations.push(...violations);
  }
  if (allViolations.length) {
    console.error('Policy audit failed. Missing policy wrappers on protected routes:');
    for (const issue of allViolations) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log('Policy audit passed.');
}

main().catch((error) => {
  console.error('Policy audit crashed:', error);
  process.exitCode = 1;
});

