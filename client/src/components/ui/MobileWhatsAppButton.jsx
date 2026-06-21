import { useLocation } from 'react-router-dom';
import { getAdminShellSegment } from '../../config/adminShellConfig.js';
import './MobileWhatsAppButton.css';

const WHATSAPP_URL = 'https://wa.me/923141227364';

function isStaffPanelPath(pathname) {
  const path = String(pathname || '');
  if (path === '/teacher' || path.startsWith('/teacher/')) return true;
  const adminBase = `/${getAdminShellSegment()}`;
  return path === adminBase || path.startsWith(`${adminBase}/`);
}

export default function MobileWhatsAppButton() {
  const { pathname } = useLocation();

  if (isStaffPanelPath(pathname)) {
    return null;
  }

  return (
    <a
      className="mobile-whatsapp-button"
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
    >
      <svg
        className="mobile-whatsapp-button__icon"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M20.52 3.48A11.9 11.9 0 0 0 12.06 0C5.48 0 .13 5.35.13 11.93c0 2.1.55 4.15 1.59 5.95L0 24l6.3-1.66a11.87 11.87 0 0 0 5.76 1.47h.01c6.58 0 11.93-5.35 11.93-11.93 0-3.18-1.24-6.17-3.48-8.4ZM12.07 21.8h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.9 9.9 0 0 1-1.52-5.24c0-5.47 4.45-9.92 9.92-9.92 2.65 0 5.14 1.03 7.01 2.9a9.84 9.84 0 0 1 2.91 7.01c0 5.47-4.45 9.92-9.92 9.92Z"
          fill="#fff"
        />
        <path
          d="M17.99 14.11c-.29-.15-1.72-.85-1.99-.95-.27-.1-.47-.14-.67.15-.2.29-.76.95-.94 1.14-.17.2-.35.22-.64.07-.29-.15-1.23-.45-2.35-1.43-.87-.77-1.46-1.72-1.63-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.35.44-.52.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.29-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.07 4.49.71.31 1.27.5 1.7.64.71.23 1.36.2 1.88.12.57-.09 1.72-.7 1.97-1.38.24-.67.24-1.25.17-1.38-.07-.12-.27-.2-.57-.35Z"
          fill="#fff"
        />
      </svg>
    </a>
  );
}
