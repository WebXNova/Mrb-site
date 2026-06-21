/**
 * Consistent Lucide-style stroke icons for the student portal.
 * @param {{ size?: number, className?: string, strokeWidth?: number }} props
 */

function IconBase({ size = 20, className = '', strokeWidth = 1.75, children, viewBox = '0 0 24 24' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </IconBase>
  );
}

export function IconBookOpen(props) {
  return (
    <IconBase {...props}>
      <path d="M12 7v14M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16.5H6.5A2.5 2.5 0 0 0 4 22V5.5Z" />
      <path d="M6.5 3v16.5" />
    </IconBase>
  );
}

export function IconVideo(props) {
  return (
    <IconBase {...props}>
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="m22 7-6 4 6 4V7Z" />
    </IconBase>
  );
}

export function IconClipboardCheck(props) {
  return (
    <IconBase {...props}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1" />
      <path d="m9 14 2 2 4-4" />
    </IconBase>
  );
}

export function IconBarChart(props) {
  return (
    <IconBase {...props}>
      <path d="M12 20V10M18 20V4M6 20v-6" />
    </IconBase>
  );
}

export function IconHelpCircle(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a3 3 0 1 1 5.2 2c-.8.8-1.7 1.1-1.7 2.1" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconUser(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </IconBase>
  );
}

export function IconBell(props) {
  return (
    <IconBase {...props}>
      <path d="M12 4a4 4 0 0 0-4 4v2.5c0 .6-.2 1.2-.6 1.7L6 14.5h12l-1.4-2.3c-.4-.5-.6-1.1-.6-1.7V8a4 4 0 0 0-4-4Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function IconSettings(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </IconBase>
  );
}

export function IconLogOut(props) {
  return (
    <IconBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </IconBase>
  );
}

export function IconSearch(props) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  );
}

export function IconCalendar(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </IconBase>
  );
}

export function IconLayers(props) {
  return (
    <IconBase {...props}>
      <path d="m12 2 8 4.5v7L12 18l-8-4.5v-7L12 2Z" />
      <path d="m4.5 10.5 7.5 4 7.5-4M12 22V14" />
    </IconBase>
  );
}

export function IconAward(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="9" r="5" />
      <path d="M8.5 14 7 22l5-2.5L17 22l-1.5-8" />
    </IconBase>
  );
}

export function IconTrophy(props) {
  return (
    <IconBase {...props}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
      <path d="M12 11v3M9 20h6M10 14h4v3a2 2 0 0 1-4 0v-3Z" />
    </IconBase>
  );
}

export function IconMessage(props) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16v10H8l-4 4V6Z" />
    </IconBase>
  );
}

export function IconTrending(props) {
  return (
    <IconBase {...props}>
      <path d="M4 18l5-6 4 3 7-9" />
    </IconBase>
  );
}

export function IconLightbulb(props) {
  return (
    <IconBase {...props}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3 10.2V15H9v-1.8A6 6 0 0 1 12 3Z" />
    </IconBase>
  );
}

export function IconMenu(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </IconBase>
  );
}

const ICON_MAP = {
  dashboard: IconDashboard,
  'book-open': IconBookOpen,
  video: IconVideo,
  'clipboard-check': IconClipboardCheck,
  'bar-chart': IconBarChart,
  'help-circle': IconHelpCircle,
  user: IconUser,
  bell: IconBell,
  settings: IconSettings,
  'log-out': IconLogOut,
  search: IconSearch,
  calendar: IconCalendar,
  layers: IconLayers,
  award: IconAward,
  trophy: IconTrophy,
  message: IconMessage,
  trending: IconTrending,
  lightbulb: IconLightbulb,
  menu: IconMenu,
};

export default function StudentIcon({ name, size = 20, className = '', strokeWidth = 1.75 }) {
  const Component = ICON_MAP[name];
  if (!Component) return null;
  return <Component size={size} className={`sp-icon ${className}`.trim()} strokeWidth={strokeWidth} />;
}

export { ICON_MAP as studentIconMap };
