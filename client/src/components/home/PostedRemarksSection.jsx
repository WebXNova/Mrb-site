import { useEffect, useState } from 'react';
import { fetchPostedRemarks } from './usePostedRemarks';
import PostedRemarkQuote from './PostedRemarkQuote';
import './PostedRemarksSection.css';

export default function PostedRemarksSection() {
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPostedRemarks()
      .then((items) => {
        if (!cancelled) setRemarks(items);
      })
      .catch(() => {
        if (!cancelled) setRemarks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && remarks.length === 0) return null;

  return (
    <section
      className="section posted-remarks posted-remarks--visible"
      aria-labelledby="posted-remarks-heading"
    >
      <div className="container">
        <div className="posted-remarks__head">
          <span className="eyebrow">Student feedback</span>
          <h2 id="posted-remarks-heading" className="heading-1 text-balance">
            What Our Students Say
          </h2>
          <p className="body-lg text-pretty posted-remarks__lead">
            Messages shared by students who studied with MRB Classes.
          </p>
        </div>

        {loading ? (
          <div className="posted-remarks__grid posted-remarks__grid--loading" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="posted-remarks__skeleton" />
            ))}
          </div>
        ) : (
          <div className="posted-remarks__grid">
            {remarks.map((remark, index) => (
              <article
                key={remark.id}
                className="posted-remark-card"
                style={{ '--i': index }}
              >
                <PostedRemarkQuote remark={remark} />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
