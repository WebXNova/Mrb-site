import { useCallback, useEffect, useRef, useState } from 'react';

const ROW_HEIGHT = 96;

export default function VirtualInboxList({
  items = [],
  selectedId,
  onSelect,
  onEndReached,
  hasMore = false,
  loadingMore = false,
  renderRow,
  ariaLabel = 'Question list',
}) {
  const scrollRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight || 480));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 2) {
      onEndReached?.();
    }
  }, [hasMore, loadingMore, onEndReached]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 4;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const slice = items.slice(startIndex, endIndex);
  const totalHeight = items.length * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;

  return (
    <div ref={scrollRef} className="tq-ws-inbox__virtual" onScroll={onScroll} role="listbox" aria-label={ariaLabel}>
      <div className="tq-ws-inbox__virtual-spacer" style={{ height: totalHeight }}>
        <div className="tq-ws-inbox__virtual-window" style={{ transform: `translateY(${offsetY}px)` }}>
          {slice.map((item) => (
            <div
              key={item.threadId || item.id}
              role="option"
              aria-selected={String(item.threadId || item.id) === String(selectedId)}
              style={{ height: ROW_HEIGHT }}
            >
              {renderRow(item, String(item.id) === String(selectedId))}
            </div>
          ))}
        </div>
      </div>
      {loadingMore ? <p className="tq-ws-inbox__loading-more">Loading more…</p> : null}
    </div>
  );
}
