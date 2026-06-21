import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import {
  SEO_DEFAULTS,
  buildCanonicalUrl,
  getRouteSeoConfig,
  isPrivateRoute,
  resolveSeoImage,
} from '../../seo/seoConfig.js';
import { buildGlobalStructuredData } from '../../seo/structuredData.js';
import { useSeoContext } from '../../seo/SeoContext.jsx';

function normalizeStructuredData(extra) {
  if (!extra) return [];
  return Array.isArray(extra) ? extra : [extra];
}

/**
 * Global head manager — reads route + optional page overrides.
 * Fallback rule: any missing field defaults to MRB Classes branding.
 */
export default function MetaHead() {
  const location = useLocation();
  const { pageSeo } = useSeoContext();

  const routeSeo = getRouteSeoConfig(location.pathname);
  const seoData = pageSeo || routeSeo;

  const title = seoData?.title || SEO_DEFAULTS.title;
  const description = seoData?.description || SEO_DEFAULTS.description;
  const image = resolveSeoImage(seoData?.image || SEO_DEFAULTS.image);
  const canonical = buildCanonicalUrl(location.pathname, location.search);
  const privateRoute = isPrivateRoute(location.pathname) || Boolean(seoData?.noindex);
  const robots = privateRoute ? 'noindex, nofollow' : 'index, follow';

  const structuredData = buildGlobalStructuredData(
    normalizeStructuredData(seoData?.structuredData)
  );

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SEO_DEFAULTS.siteName} />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content={SEO_DEFAULTS.twitterCard} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {structuredData.map((schema, index) => (
        <script key={`ld-${index}`} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
