import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QaTimelineCard from './QaTimelineCard';

/**
 * @param {{
 *   items: Record<string, unknown>[],
 *   loading?: boolean,
 *   loadingMore?: boolean,
 *   hasMore?: boolean,
 *   onLoadMore?: () => void,
 * }} props
 */
export default function QaTimeline({
  items,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore || loading || loadingMore || !onLoadMore) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, onLoadMore]);

  if (loading && items.length === 0) {
    return (
      <div className="qa-timeline" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="qa-skeleton qa-skeleton--card" style={{ marginBottom: '1rem' }} />
        ))}
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <motion.div
        className="qa-timeline__empty"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p>No conversations match your filters.</p>
        <p style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
          Adjust filters or select a different teacher to view Q&A history.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="qa-timeline">
      <div className="qa-timeline__line" aria-hidden="true" />
      <ul className="qa-timeline__list">
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => (
            <QaTimelineCard key={`q-${item.id}`} item={item} index={index} />
          ))}
        </AnimatePresence>
      </ul>

      <div className="qa-timeline__sentinel" ref={sentinelRef} aria-hidden="true" />

      {loadingMore ? (
        <div className="qa-timeline__load-more">
          <div className="qa-skeleton qa-skeleton--card" style={{ width: '100%', maxWidth: '720px', height: '80px' }} />
        </div>
      ) : null}

      {!hasMore && items.length > 0 ? (
        <p className="qa-timeline__empty" style={{ padding: '1.5rem', fontSize: '0.8rem' }}>
          End of conversation history
        </p>
      ) : null}
    </div>
  );
}
