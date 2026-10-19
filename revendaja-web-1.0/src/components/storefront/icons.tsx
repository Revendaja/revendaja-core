import type { BenefitIcon } from '@/lib/api/types';

// Ícones da vitrine pública (traço, mesmo estilo do painel).
type SvgProps = { size?: number; className?: string };

function Svg({ size = 20, className, children }: SvgProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export const TruckIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M3 6h11v10H3z" />
    <path d="M14 10h4l3 3v3h-7" />
    <circle cx="7.5" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </Svg>
);

export const CardIcon = (props: SvgProps) => (
  <Svg {...props}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 10h19M6.5 15h3" />
  </Svg>
);

export const ShieldIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const ChatIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </Svg>
);

export const GiftIcon = (props: SvgProps) => (
  <Svg {...props}>
    <rect x="3" y="9" width="18" height="4" rx="1" />
    <path d="M5 13v7h14v-7M12 9v11" />
    <path d="M12 9c-2.5 0-4-1-4-2.5S9 4 10.5 4C12 4 12 6 12 9Zm0 0c2.5 0 4-1 4-2.5S15 4 13.5 4C12 4 12 6 12 9Z" />
  </Svg>
);

export const StarIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </Svg>
);

export const ArrowRightIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const BoltIcon = (props: SvgProps) => (
  <Svg {...props}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
  </Svg>
);

export const GridIcon = (props: SvgProps) => (
  <Svg {...props}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Svg>
);

export const BENEFIT_ICON_COMPONENTS: Record<BenefitIcon, (props: SvgProps) => React.ReactElement> = {
  truck: TruckIcon,
  card: CardIcon,
  shield: ShieldIcon,
  chat: ChatIcon,
  gift: GiftIcon,
  star: StarIcon,
};
