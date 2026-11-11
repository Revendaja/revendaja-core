type Props = {
  eyebrow: string;
  title: string;
  text?: string;
  tone?: 'light' | 'dark';
  align?: 'center' | 'left';
};

// Cabeçalho padrão das seções da landing: mesma hierarquia em todas (rótulo, título, apoio).
export function SectionHeading({ eyebrow, title, text, tone = 'light', align = 'center' }: Props) {
  const dark = tone === 'dark';
  return (
    <div className={`reveal flex flex-col ${align === 'center' ? 'mx-auto items-center text-center' : 'items-start text-left'} max-w-2xl`}>
      <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${dark ? 'text-primary-400' : 'text-primary-600'}`}>
        {eyebrow}
      </span>
      <h2
        className={`mt-4 text-balance text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl lg:text-[2.75rem] ${
          dark ? 'text-white' : 'text-ink-900'
        }`}
      >
        {title}
      </h2>
      {text && (
        <p className={`mt-4 text-pretty leading-relaxed sm:text-lg ${dark ? 'text-white/65' : 'text-ink-600'}`}>{text}</p>
      )}
    </div>
  );
}
