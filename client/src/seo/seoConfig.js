import { getAdminShellSegment, isAdminShellConfigured } from '../config/adminShellConfig.js';

/** Production site origin — used for canonical URLs and absolute OG image paths. */
export const SITE_ORIGIN = 'https://mrbclasses.com';

export const SEO_DEFAULTS = {
  siteName: 'MRB Classes',
  title: 'MRB Classes',
  description: 'A platform of MDCAT Toppers where an average student can grow.',
  image: `${SITE_ORIGIN}/assets/mrb-logo.png`,
  twitterCard: 'summary_large_image',
};

export const SOCIAL_PROFILES = [
  'https://www.instagram.com/muzamil_rb',
  'https://www.tiktok.com/@mrb.classes.mdcat',
  'https://www.facebook.com/profile.php?id=61574737812603',
  'https://www.youtube.com/@786muzamilrb',
];

/** Page-specific SEO overrides keyed by exact pathname or pattern. */
export const ROUTE_SEO = {
  '/': {
    title: 'MRB Classes — Where Average Students Become Toppers',
    description: SEO_DEFAULTS.description,
  },
  '/courses': {
    title: 'MDCAT & ECAT Courses | MRB Classes',
    description:
      'Browse MDCAT preparation courses, free mock tests, and structured lectures in Physics, Chemistry, and Biology.',
  },
  '/about': {
    title: 'About MRB Classes — MDCAT Toppers Platform',
    description:
      'Learn how MRB Classes helps serious students with structured lectures, timed tests, and expert doubt support.',
  },
  '/contact': {
    title: 'Contact MRB Classes',
    description: 'Reach the MRB Classes team for admissions, support, and course enquiries.',
  },
  '/search': {
    title: 'Search Courses | MRB Classes',
    description: 'Find MDCAT preparation courses and free tests across Physics, Chemistry, Biology, and more.',
  },
  '/privacy': {
    title: 'Privacy Policy | MRB Classes',
    description: 'How MRB Classes collects, uses, and protects your personal information.',
  },
  '/terms': {
    title: 'Terms of Service | MRB Classes',
    description: 'Terms and conditions for using the MRB Classes learning platform.',
  },
  '/refund': {
    title: 'Refund Policy | MRB Classes',
    description: 'Refund and cancellation policy for MRB Classes paid courses.',
  },
};

/**
 * Resolve static route SEO for a pathname (supports `/courses/:id` prefix match).
 * @param {string} pathname
 */
export function getRouteSeoConfig(pathname) {
  if (ROUTE_SEO[pathname]) return ROUTE_SEO[pathname];

  if (pathname.startsWith('/courses/') && pathname !== '/courses') {
    return {
      title: 'Course Details | MRB Classes',
      description: SEO_DEFAULTS.description,
    };
  }

  if (pathname.startsWith('/tests/')) {
    return {
      title: 'Practice Test | MRB Classes',
      description: 'Take a free MDCAT practice test on MRB Classes.',
    };
  }

  return null;
}

/**
 * Routes that must not be indexed (admin, student, teacher portals).
 * @param {string} pathname
 */
export function isPrivateRoute(pathname) {
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/student' ||
    pathname.startsWith('/student/')
  ) {
    return true;
  }

  if (pathname.startsWith('/teacher')) return true;

  if (isAdminShellConfigured()) {
    const adminSegment = getAdminShellSegment();
    if (pathname === `/${adminSegment}` || pathname.startsWith(`/${adminSegment}/`)) {
      return true;
    }
  }

  if (pathname.startsWith('/enrollment/payment')) return true;
  if (pathname.startsWith('/enroll/')) return true;

  return false;
}

/**
 * Build absolute canonical URL for the current path.
 * @param {string} pathname
 * @param {string} [search]
 */
export function buildCanonicalUrl(pathname, search = '') {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const query = search && search.startsWith('?') ? search : search ? `?${search}` : '';
  return `${SITE_ORIGIN}${path}${query}`;
}

/**
 * Resolve absolute image URL for OG tags.
 * @param {string | undefined | null} image
 */
export function resolveSeoImage(image) {
  const value = image || SEO_DEFAULTS.image;
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return `${SITE_ORIGIN}${normalized}`;
}
