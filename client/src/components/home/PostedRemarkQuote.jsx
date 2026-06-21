import { useCallback, useEffect, useRef, useState } from 'react';
import { getInitials } from './testimonialUtils';

const LONG_CHAR_THRESHOLD = 180;

export default function PostedRemarkQuote({ remark, variant = 'default' }) {
  const textRef = useRef(null);
  const [canScroll, setCanScroll] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [thumb, setThumb] = useState({ height: 35, top: 0 });
  const isHero = variant === 'hero';
  const message = String(remark?.message || '').trim();
  const likelyLong = message.length > LONG_CHAR_THRESHOLD;

  const checkScroll = useCallback(() => {
    const el = textRef.current;
    if (!el) return;

    const overflow = el.scrollHeight > el.clientHeight + 4;
    setCanScroll(overflow);
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 10);

    if (overflow) {
      const thumbHeight = Math.max(18, (el.clientHeight / el.scrollHeight) * 100);
      const maxTop = 100 - thumbHeight;
      const scrollRatio =
        el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
      setThumb({ height: thumbHeight, top: scrollRatio * maxTop });
    }
  }, []);

  useEffect(() => {
    const el = textRef.current;
    if (el) el.scrollTop = 0;
    checkScroll();
  }, [message, checkScroll]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkScroll]);

  if (!remark) return null;

  const showScrollChrome = isHero && (canScroll || likelyLong);

  return (
    <div className={`vip-remark ${isHero ? 'vip-remark--hero' : ''}`}>
      <div className="vip-remark__glow" aria-hidden="true" />
      <span className="vip-remark__quote-mark" aria-hidden="true">
        &ldquo;
      </span>

      <div
        className={[
          'vip-remark__scroll-area',
          showScrollChrome ? 'vip-remark__scroll-area--scrollable' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <blockquote
          ref={textRef}
          className={[
            'vip-remark__text',
            isHero ? 'vip-remark__text--hero' : '',
            showScrollChrome ? 'vip-remark__text--scroll' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onScroll={checkScroll}
          tabIndex={showScrollChrome && canScroll ? 0 : undefined}
        >
          <p>{message}</p>
        </blockquote>

        {showScrollChrome && canScroll ? (
          <aside className="vip-remark__scroll-sidebar" aria-hidden="true">
            <span className="vip-remark__scroll-sidebar-label">More</span>
            <div className="vip-remark__scroll-sidebar-track">
              <span
                className="vip-remark__scroll-sidebar-thumb"
                style={{ height: `${thumb.height}%`, top: `${thumb.top}%` }}
              />
            </div>
          </aside>
        ) : null}

        {showScrollChrome && canScroll && !atBottom ? (
          <div className="vip-remark__scroll-fade" aria-hidden="true" />
        ) : null}
      </div>

      <footer className="vip-remark__footer">
        <div className="vip-remark__avatar" aria-hidden="true">
          {getInitials(remark.name)}
        </div>
        <cite className="vip-remark__name">— {remark.name}</cite>
      </footer>
    </div>
  );
}
