import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../src');

const FILES = [
  'admin/pages/AdminCoursesPage.jsx',
  'features/quiz-builder/components/QuizBuilderView.jsx',
  'admin/pages/AdminTestCreatePage.jsx',
  'admin/components/TestSetupLayout.jsx',
  'features/quiz-builder/components/QuizBuilderReadinessPanel.jsx',
  'admin/components/TestWizardMissingHint.jsx',
  'admin/pages/AdminTestsPage.jsx',
  'admin/pages/AdminTestDetailsPage.jsx',
  'admin/pages/AdminQuestionBankPage.jsx',
  'admin/pages/AdminTestEditRedirectPage.jsx',
  'admin/pages/AdminTestSetupPage.jsx',
  'admin/components/TestRowActionsMenu.jsx',
  'admin/pages/AdminTestEditSettingsPage.jsx',
  'admin/pages/AdminTestEditRulesPage.jsx',
  'admin/pages/AdminTestEditBasicInfoPage.jsx',
  'admin/pages/AdminTestRulesPage.jsx',
  'admin/pages/AdminTestSettingsPage.jsx',
  'admin/components/AdminLayout.jsx',
  'admin/pages/AdminTeacherEditPage.jsx',
  'admin/pages/AdminTeachersPage.jsx',
  'admin/components/teachers/AdminTeacherMobileCard.jsx',
  'admin/pages/AdminTeacherCreatePage.jsx',
  'admin/components/teachers/TeacherRowActions.jsx',
  'admin/components/courses/CourseDataGrid.jsx',
  'admin/hooks/usePublishTest.js',
  'features/create-question/components/CreateQuestionPage.jsx',
  'features/quiz-builder/pages/QuizBuilderPage.jsx',
  'features/create-question/components/TopActionBar.jsx',
  'admin/pages/AdminCreateQuestionPage.jsx',
  'admin/components/AdminTestPageHeader.jsx',
  'admin/pages/AdminCourseBatchesPage.jsx',
  'admin/pages/AdminLoginPage.jsx',
  'admin/pages/AdminCourseSubjectsPage.jsx',
];

function relativeImportDepth(fileRel) {
  const depth = fileRel.split('/').length - 1;
  return `${'../'.repeat(depth)}config/adminPaths`;
}

function migrateFile(fileRel) {
  const abs = path.join(SRC, fileRel);
  let source = fs.readFileSync(abs, 'utf8');
  if (!source.includes('/admin')) return;

  const importPath = relativeImportDepth(fileRel);
  if (!source.includes("from '") && !source.includes('from "')) {
    return;
  }

  if (!source.includes('adminRoute')) {
    const importLine = `import { adminRoute } from '${importPath}';\n`;
    const reactMatch = source.match(/^import .+from ['"]react['"];?\n/m);
    if (reactMatch) {
      source = source.replace(reactMatch[0], `${reactMatch[0]}${importLine}`);
    } else {
      source = `${importLine}${source}`;
    }
  }

  source = source.replace(/(['"`])\/admin\/([^'"`$]+)\1/g, (_, _q, sub) => `adminRoute('${sub}')`);
  source = source.replace(/`\/admin\/(\$\{[^}]+\}[^`]*)`/g, '`${adminRoute(`$1`)}`');
  source = source.replace(/`\/admin\/([^`$]+)`/g, (match, sub) => {
    if (sub.includes('${')) {
      return `\${adminRoute(\`${sub}\`)}`.replace(/^\$/, '');
    }
    return `adminRoute(\`${sub}\`)`;
  });

  source = source.replace(/navigate\(`\$\{adminRoute\(`([^`]+)`\)\}([^`]*)`/g, 'navigate(`${adminRoute(`$1`)}$2`');
  source = source.replace(/to=\{`\$\{adminRoute\(`([^`]+)`\)\}([^`]*)`\}/g, 'to={`${adminRoute(`$1`)}$2`}');

  source = source.replace(/navigate\('\/admin\/([^']+)'\)/g, "navigate(adminRoute('$1'))");
  source = source.replace(/navigate\("\/admin\/([^"]+)"\)/g, 'navigate(adminRoute("$1"))');
  source = source.replace(/navigate\(`\/admin\/([^`]+)`\)/g, 'navigate(adminRoute(`$1`))');
  source = source.replace(/navigate\('\/admin'\)/g, 'navigate(adminRoute())');
  source = source.replace(/navigate\("\/admin"\)/g, 'navigate(adminRoute())');
  source = source.replace(/navigate\(`\/admin`\)/g, 'navigate(adminRoute())');

  source = source.replace(/to="\/admin\/([^"]+)"/g, 'to={adminRoute("$1")}');
  source = source.replace(/to='\/admin\/([^']+)'/g, "to={adminRoute('$1')}");
  source = source.replace(/to={`\/admin\/([^`]+)`}/g, 'to={adminRoute(`$1`)}');
  source = source.replace(/to="\/admin"/g, 'to={adminRoute()}');
  source = source.replace(/to='\/admin'/g, 'to={adminRoute()}');

  source = source.replace(/backTo="\/admin\/([^"]+)"/g, 'backTo={adminRoute("$1")}');
  source = source.replace(/backTo='\/admin\/([^']+)'/g, "backTo={adminRoute('$1')}");
  source = source.replace(/backTo = '\/admin\/([^']+)'/g, "backTo = adminRoute('$1')");
  source = source.replace(/backTo = '\/admin'/g, 'backTo = adminRoute()');

  source = source.replace(/onCancelTo="\/admin\/([^"]+)"/g, 'onCancelTo={adminRoute("$1")}');
  source = source.replace(/onCancelTo='\/admin\/([^']+)'/g, "onCancelTo={adminRoute('$1')}");

  source = source.replace(/<Navigate to={`\/admin\/([^`]+)`}/g, '<Navigate to={adminRoute(`$1`)}');
  source = source.replace(/<Navigate to="\/admin\/([^"]+)"/g, '<Navigate to={adminRoute("$1")}');
  source = source.replace(/rawReturnTo\.startsWith\('\/admin'\)/g, "rawReturnTo.startsWith(adminRoute())");

  source = source.replace(/\|\| '\/admin'/g, '|| adminRoute()');
  source = source.replace(/\|\| "\/admin"/g, '|| adminRoute()');
  source = source.replace(/\|\| '\/admin\/tests'/g, "|| adminRoute('tests')");

  source = source.replace(/const target = `\/admin\/(\$\{[^}]+\}[^`]*)`/g, 'const target = adminRoute(`$1`)');
  source = source.replace(/const (\w+) = testId \? `\/admin\/(\$\{[^}]+\}[^`]*)`/g, 'const $1 = testId ? adminRoute(`$2`)');
  source = source.replace(/const (\w+) = testId \? `\/admin\/([^`]+)` : null/g, 'const $1 = testId ? adminRoute(`$2`) : null');
  source = source.replace(/const (\w+) = testId \? `\/admin\/([^`]+)`/g, 'const $1 = testId ? adminRoute(`$2`)');

  fs.writeFileSync(abs, source);
  console.log('migrated', fileRel);
}

for (const file of FILES) {
  migrateFile(file);
}
