import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button';

export function ErrorState({ message, onRetry, retrying }: { message: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold">Couldn't load emails</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} loading={retrying} leftIcon={<RotateCw className="size-3.5" />}>
          Try again
        </Button>
      )}
    </div>
  );
}
