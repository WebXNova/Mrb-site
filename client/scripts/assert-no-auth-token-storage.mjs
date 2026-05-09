import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientRoot = path.resolve(__dirname, '..');

const forbiddenPatterns = [
  'mrb_access_admin',
  'mrb_access_student',
  'admin_access_token',
  'student_access_token',
  'Authorization: `Bearer ${',
  'Authorization: "Bearer ',
];

async function read(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function main() {
  const filesToCheck = [
    path.join(clientRoot, 'src', 'auth', 'session.js'),
    path.join(clientRoot, 'src', 'api', 'requestClient.js'),
    path.join(clientRoot, 'src', 'admin', 'pages', 'AdminLoginPage.jsx'),
    path.join(clientRoot, 'src', 'pages', 'StudentLoginPage.jsx'),
    path.join(clientRoot, 'src', 'pages', 'StudentRegisterPage.jsx'),
  ];

  const errors = [];
  for (const file of filesToCheck) {
    const text = await read(file);
    for (const pattern of forbiddenPatterns) {
      if (!text.includes(pattern)) continue;
      // Allow explicit cleanup removals in session.js.
      if (file.endsWith(path.join('auth', 'session.js')) && pattern.startsWith('mrb_access_')) continue;
      if (file.endsWith(path.join('auth', 'session.js')) && pattern.endsWith('_access_token')) continue;
      errors.push(`${path.relative(clientRoot, file)} contains forbidden pattern: ${pattern}`);
    }
  }

  if (errors.length) {
    console.error('FAIL: Cookie-only auth storage guard failed.');
    for (const error of errors) console.error(` - ${error}`);
    process.exit(1);
  }
  console.log('PASS: No browser auth token storage/write patterns detected.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

