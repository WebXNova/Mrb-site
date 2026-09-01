function Icon({ children, size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconFileText(props) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </Icon>
  );
}

export function IconLayout(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Icon>
  );
}

export function IconEye(props) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function IconKey(props) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8.7-8.7M17 5.5l2.5 2.5" />
    </Icon>
  );
}

export function IconAward(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="5.5" />
      <path d="M8.5 13.2 7 22l5-2.5L17 22l-1.5-8.8" />
    </Icon>
  );
}

export function IconShield(props) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6.5v5.2c0 4.2 2.8 7.3 7 8.8 4.2-1.5 7-4.6 7-8.8V6.5L12 3Z" />
    </Icon>
  );
}

export function IconTag(props) {
  return (
    <Icon {...props}>
      <path d="M12.5 3.5 20.5 11.5 13 19l-8-8V3.5h7.5Z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </Icon>
  );
}

export function IconBanknote(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7 10v4M17 10v4" />
    </Icon>
  );
}

export function IconUsers(props) {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a3 3 0 0 1 0 5.87" />
    </Icon>
  );
}

export function IconRotate(props) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

export function IconClock(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function IconStatus(props) {
  return (
    <Icon {...props}>
      <path d="M12 3v4M12 17v4M5 12H3M21 12h-2M6.2 6.2l2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function IconInfo(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function IconCheck(props) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}
