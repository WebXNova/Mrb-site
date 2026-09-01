/**
 * First-paint SEO for the SPA (before React Helmet). Keep in sync with src/seo/seoConfig.js.
 */
(function () {
  var ORIGIN = 'https://mrbclasses.com';
  var path = location.pathname || '/';
  var key = path.replace(/\/+$/, '') || '/';

  var PRIVATE =
    key === '/login' ||
    key.indexOf('/login/') === 0 ||
    key === '/dashboard' ||
    key.indexOf('/dashboard/') === 0 ||
    key === '/student' ||
    key.indexOf('/student/') === 0 ||
    key.indexOf('/teacher') === 0 ||
    key.indexOf('/enroll/') === 0 ||
    key.indexOf('/enrollment/payment') === 0 ||
    key.indexOf('/tests/') === 0 ||
    key === '/tests/my-results' ||
    key === '/tests/my-tests' ||
    /\/paid-tests\/.+\/(register|pay)$/.test(key);

  var PAGES = {
    '/': [
      'MRB Classes — Where Average Students Become Toppers',
      'A platform of MDCAT Toppers where an average student can grow.',
    ],
    '/courses': [
      'MDCAT & ECAT Courses | MRB Classes',
      'Browse MDCAT preparation courses, free mock tests, and structured lectures in Physics, Chemistry, and Biology.',
    ],
    '/about': [
      'About MRB Classes — MDCAT Toppers Platform',
      'Learn how MRB Classes helps serious students with structured lectures, timed tests, and expert doubt support.',
    ],
    '/contact': [
      'Contact MRB Classes',
      'Reach the MRB Classes team for admissions, support, and course enquiries.',
    ],
    '/search': [
      'Search Courses | MRB Classes',
      'Find MDCAT preparation courses and free tests across Physics, Chemistry, Biology, and more.',
    ],
    '/privacy': [
      'Privacy Policy | MRB Classes',
      'How MRB Classes collects, uses, and protects your personal information.',
    ],
    '/terms': [
      'Terms of Service | MRB Classes',
      'Terms and conditions for using the MRB Classes learning platform.',
    ],
    '/refund': [
      'Refund Policy | MRB Classes',
      'Refund and cancellation policy for MRB Classes paid courses.',
    ],
    '/paid-tests': [
      'MDCAT Tests | MRB Classes',
      'Register for paid standalone tests and find free practice tests included with MRB Classes courses.',
    ],
  };

  function setNamed(name, content) {
    var el = document.querySelector('meta[name="' + name + '"]');
    if (el && content) el.setAttribute('content', content);
  }

  function setProp(property, content) {
    var el = document.querySelector('meta[property="' + property + '"]');
    if (el && content) el.setAttribute('content', content);
  }

  if (PRIVATE) {
    setNamed('robots', 'noindex, nofollow');
  }

  var pair = PAGES[key];
  if (!pair && key.indexOf('/paid-tests/') === 0 && !PRIVATE) {
    pair = [
      'Paid Test | MRB Classes',
      'Register for a paid standalone test at MRB Classes. Payment is reviewed before a seat is confirmed.',
    ];
  }
  if (!pair && key.indexOf('/courses/') === 0) {
    pair = [
      'Course Details | MRB Classes',
      'A platform of MDCAT Toppers where an average student can grow.',
    ];
  }

  var canonical = ORIGIN + path + (location.search || '');
  var link = document.querySelector('link[rel="canonical"]');
  if (link) link.setAttribute('href', canonical);
  setProp('og:url', canonical);

  if (pair) {
    document.title = pair[0];
    setNamed('description', pair[1]);
    setProp('og:title', pair[0]);
    setProp('og:description', pair[1]);
    setNamed('twitter:title', pair[0]);
    setNamed('twitter:description', pair[1]);
  }
})();
