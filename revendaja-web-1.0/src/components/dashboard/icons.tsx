export type IconName =
  | 'grid' | 'bell' | 'box' | 'catalog' | 'plus' | 'cart' | 'receipt' | 'chart' | 'users'
  | 'store' | 'edit' | 'globe' | 'user' | 'card' | 'star' | 'logout' | 'dots' | 'userPlus'
  | 'smile' | 'layout' | 'chevronDown' | 'chevrons' | 'car' | 'plane' | 'chartLine' | 'lock'
  | 'search' | 'flag' | 'trash' | 'check' | 'download' | 'sparkle' | 'command' | 'menu' | 'perfume' | 'eye' | 'copy' | 'externalLink'
  | 'pix' | 'cash' | 'barcode' | 'basket' | 'minus' | 'close';

const PATHS: Record<IconName, React.ReactNode> = {
  grid: (<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>),
  bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>),
  box: (<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>),
  catalog: (<><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 9v11" /></>),
  plus: (<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
  cart: (<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l3 12h11l2-8H6" /></>),
  receipt: (<><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></>),
  chart: (<><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.5.7 4 2.7 4 5.5" /></>),
  store: (<><path d="M3 9 5 3h14l2 6" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v9h14v-9" /></>),
  edit: (<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></>),
  card: (<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>),
  star: (<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>),
  dots: (<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  userPlus: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
  smile: (<><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>),
  layout: (<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevrons: (<><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></>),
  car: (<><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M9 17h6" /></>),
  plane: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  chartLine: (<><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>),
  lock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>),
  sparkle: <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  command: <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />,
  menu: <path d="M4 9h10M4 15h16" />,
  perfume: (<><rect x="9" y="2" width="6" height="3.5" rx="1" /><path d="M10.5 5.5V8M13.5 5.5V8" /><rect x="5.5" y="8" width="13" height="14" rx="3" /><path d="M10 14h4" /></>),
  eye: (<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  flag: <path d="M5 21V4M5 4h11l-2.5 4L16 12H5" />,
  trash: (<><path d="M3 6h18M8 6V4h8v2" /><path d="m6 6 1 14h10l1-14M10 11v5M14 11v5" /></>),
  check: <path d="m5 12 5 5 9-10" />,
  externalLink: (<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>),
  copy: (<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
  pix: <path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
  cash: (<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 10v.01M18 10v.01M6 14v.01M18 14v.01" /></>),
  barcode: (<><path d="M3 5v14M7 5v14M11 5v10M15 5v14M19 5v10M21 5v14" /></>),
  basket: (<><path d="M3 10h18l-1.5 9a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7z" /><path d="M8 10 10 4M16 10 14 4M9 14v4M15 14v4" /></>),
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.7,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ''}`}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
