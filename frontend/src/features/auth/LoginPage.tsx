import { Navigate, useSearchParams } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { FullPageSpinner } from './RequireAuth';
import { useMe } from './useAuth';

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  state_mismatch: 'Your sign-in session expired. Please try again.',
  login_failed: 'We could not complete Google sign-in. Please try again.',
  invalid_request: 'Invalid sign-in response. Please try again.',
  not_configured: 'Google sign-in is not configured on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env).',
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}


export function LoginPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const error = params.get('error');

  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to="/dashboard" replace />;

  return (
    <main className="flex min-h-full items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-[536px] rounded-lg border border-line bg-surface px-6 py-12 sm:px-[62px]">
        <h1 className="text-center text-[38px] leading-tight font-semibold">Login</h1>

        {error && (
          <p role="alert" className="mt-5 rounded-md bg-danger-50 px-3 py-2 text-center text-[13px] text-danger-700">
            {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
          </p>
        )}

        <a
          href="/api/auth/google"
          className="mt-8 flex h-[52px] w-full items-center justify-center gap-3 rounded-md bg-brand-50 text-base text-ink transition-colors hover:bg-brand-100"
        >
          <GoogleIcon />
          Login with Google
        </a>

        <div className="my-7 flex items-center gap-5 text-[13px] tracking-wide text-ink-subtle" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        {/* Shown for design fidelity. Only Google OAuth is implemented (per the assignment). */}
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()} aria-describedby="email-login-note">
          <Input variant="filled" className="w-full text-sm placeholder:text-ink-muted" placeholder="Email ID" aria-label="Email ID" type="email" disabled />
          <Input variant="filled" className="w-full text-sm placeholder:text-ink-muted" placeholder="Password" aria-label="Password" type="password" disabled />
          <button type="submit" disabled className="mt-5 h-[52px] w-full rounded-md bg-brand-500 text-base text-white opacity-60">
            Login
          </button>
          <p id="email-login-note" className="pt-1 text-center text-xs text-ink-subtle">
            Email sign-in isn't enabled. Please use Google.
          </p>
        </form>
      </div>
    </main>
  );
}
