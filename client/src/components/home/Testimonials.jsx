import { testimonials } from '../../data/stats';
import './Testimonials.css';

export default function Testimonials() {
  return (
    <section className="section testimonials">
      <div className="container">
        <div className="testimonials__head">
          <span className="eyebrow">Student voices</span>
          <h2 className="heading-1 text-balance">
            Real students. Real progress.
          </h2>
        </div>

        <div className="testimonials__grid">
          {testimonials.map((t, i) => (
            <figure key={t.id} className="testimonial" style={{ '--i': i }}>
              <svg
                className="testimonial__quote-mark"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M9.5 6c-3 0-5.5 2.5-5.5 5.5 0 3 2.5 5.5 5.5 5.5 0-3-2-5-2-5l2-2v-4zm10 0c-3 0-5.5 2.5-5.5 5.5 0 3 2.5 5.5 5.5 5.5 0-3-2-5-2-5l2-2v-4z" />
              </svg>
              <blockquote className="testimonial__quote">
                {t.quote}
              </blockquote>
              <figcaption className="testimonial__caption">
                <span className="testimonial__avatar" aria-hidden="true">
                  {t.name.charAt(0)}
                </span>
                <div>
                  <span className="testimonial__name">{t.name}</span>
                  <span className="testimonial__role">{t.role}</span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
