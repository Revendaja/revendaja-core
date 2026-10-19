import { cn } from '@/lib/utils/cn';

export function Banner({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div
      className={cn(
        'mb-4 rounded-2xl px-4 py-3 text-sm font-semibold',
        type === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
      )}
      role={type === 'error' ? 'alert' : 'status'}
    >
      {message}
    </div>
  );
}
