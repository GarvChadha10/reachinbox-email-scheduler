import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { errorMessage } from '../../lib/api';
import { useMe } from './useAuth';

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-brand-600">
      <Spinner className="size-6" />
    </div>
  );
}

export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <FullPageSpinner />;
  if (me.isError) return <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} retrying={me.isFetching} />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
