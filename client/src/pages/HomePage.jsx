import PageLayout from '../components/layout/PageLayout';
import Hero from '../components/home/Hero';
import StatsBar from '../components/home/StatsBar';
import Features from '../components/home/Features';
import PopularCourses from '../components/home/PopularCourses';
import Testimonials from '../components/home/Testimonials';
import CTASection from '../components/home/CTASection';

export default function HomePage() {
  return (
    <PageLayout>
      <Hero />
      <StatsBar />
      <Features />
      <PopularCourses />
      <Testimonials />
      <CTASection />
    </PageLayout>
  );
}
