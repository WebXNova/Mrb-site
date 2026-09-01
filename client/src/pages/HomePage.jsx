import PageLayout from '../components/layout/PageLayout';
import Hero from '../components/home/Hero';
import StatsBar from '../components/home/StatsBar';
import Features from '../components/home/Features';
import PopularCourses from '../components/home/PopularCourses';
import TopScorersShowcase from '../components/home/TopScorersShowcase';
import FreeTestsShowcase from '../components/home/FreeTestsShowcase';
import PaidTestsShowcase from '../components/home/PaidTestsShowcase';
import CTASection from '../components/home/CTASection';

export default function HomePage() {
  return (
    <PageLayout>
      <Hero />
      <StatsBar />
      <Features />
      <PopularCourses />
      <FreeTestsShowcase />
      <PaidTestsShowcase compact />
      <TopScorersShowcase />
      <CTASection />
    </PageLayout>
  );
}
