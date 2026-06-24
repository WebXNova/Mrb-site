import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const GA_MEASUREMENT_ID = 'G-WXKZ94T0FW';

export default function GoogleAnalytics() {
  const location = useLocation();
  const lastPath = useRef(window.location.pathname + window.location.search);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPath.current === path) return;

    lastPath.current = path;

    if (typeof window.gtag === 'function') {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [location]);

  return null;
}
