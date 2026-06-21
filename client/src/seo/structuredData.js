import { SEO_DEFAULTS, SITE_ORIGIN, SOCIAL_PROFILES } from './seoConfig.js';

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: SEO_DEFAULTS.siteName,
    url: SITE_ORIGIN,
    logo: {
      '@type': 'ImageObject',
      url: SEO_DEFAULTS.image,
    },
    sameAs: SOCIAL_PROFILES,
    description: SEO_DEFAULTS.description,
  };
}

export function buildWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: SEO_DEFAULTS.siteName,
    url: SITE_ORIGIN,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_ORIGIN}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * @param {{
 *   name: string,
 *   description?: string,
 *   startDate?: string | null,
 *   endDate?: string | null,
 *   image?: string | null,
 *   url?: string,
 * }} course
 */
export function buildCourseSchema(course) {
  if (!course?.name) return null;

  const instance = {};
  if (course.startDate) instance.startDate = course.startDate;
  if (course.endDate) instance.endDate = course.endDate;

  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.name,
    description: course.description || SEO_DEFAULTS.description,
    provider: {
      '@type': 'Organization',
      name: SEO_DEFAULTS.siteName,
      sameAs: SITE_ORIGIN,
    },
    ...(course.url ? { url: course.url } : {}),
    ...(course.image ? { image: course.image } : {}),
    ...(Object.keys(instance).length
      ? {
          hasCourseInstance: {
            '@type': 'CourseInstance',
            courseMode: 'online',
            ...instance,
          },
        }
      : {}),
  };
}

export function buildGlobalStructuredData(extraSchemas = []) {
  const base = [buildOrganizationSchema(), buildWebSiteSchema()];
  const additional = Array.isArray(extraSchemas) ? extraSchemas.filter(Boolean) : [];
  return [...base, ...additional];
}
