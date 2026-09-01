import PageLayout from '../components/layout/PageLayout';
import PaidTestsShowcase from '../components/home/PaidTestsShowcase';
import FreeTestsShowcase from '../components/home/FreeTestsShowcase';
import TestsHubHero from '../components/public-tests/TestsHubHero.jsx';
import { usePageSeo } from '../seo/SeoContext';
import { SITE_ORIGIN } from '../seo/seoConfig';
import './tests-hub.css';

export default function PublicTestsHubPage() {
  usePageSeo({
    title: 'MDCAT Tests | MRB Classes',
    description:
      'Register for paid standalone tests or start a free session with your name. Course enrolment is not required.',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'MRB Classes Tests',
      url: `${SITE_ORIGIN}/paid-tests`,
      description: 'Paid standalone tests and free standalone tests from MRB Classes.',
    },
  });

  return (
    <PageLayout>
      <div className="tests-hub">
        <TestsHubHero />
        <FreeTestsShowcase showIndexLink={false} variant="hub" />
        <PaidTestsShowcase showIndexLink={false} variant="hub" />
      </div>
    </PageLayout>
  );
}
