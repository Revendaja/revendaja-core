import { cn } from '@/lib/utils/cn';

export function PrimaryButton({
  label,
  loading,
  disabled,
  type = 'button',
  onClick,
  className,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'flex h-12 w-full items-center justify-center rounded-2xl bg-primary-500 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        label
      )}
    </button>
  );
}
