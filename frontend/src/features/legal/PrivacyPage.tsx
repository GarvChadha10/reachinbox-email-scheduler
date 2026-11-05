import { Link } from 'react-router-dom';
import { Logo } from '../../layout/Logo';

/** Public privacy policy (Google OAuth requires one before the app can be published). */
export function PrivacyPage() {
  return (
    <main className="min-h-full bg-surface px-5 py-10">
      <article className="mx-auto max-w-2xl text-[15px] leading-relaxed text-ink">
        <Link to="/login" aria-label="Back to login">
          <Logo />
        </Link>
        <h1 className="mt-8 text-[28px] font-semibold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-ink-subtle">Email Scheduler · demo project</p>

        <h2 className="mt-8 text-lg font-semibold">What this app is</h2>
        <p className="mt-2">
          A demonstration email scheduler built for a hiring assignment. Emails are sent through Ethereal, a fake SMTP service: messages are captured for
          preview and are <strong>never delivered</strong> to real inboxes.
        </p>

        <h2 className="mt-8 text-lg font-semibold">Data we collect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Account details: your name, email address and (with Google sign-in) your profile picture URL.</li>
          <li>If you sign up with email and password: your password, stored only as a salted scrypt hash.</li>
          <li>Campaigns you create: subject, body, recipient addresses, schedule and delivery status.</li>
          <li>If you connect Slack: the incoming-webhook URL for the channel you choose, stored encrypted (AES-256-GCM).</li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold">How it is used</h2>
        <p className="mt-2">
          Only to run the app: signing you in, scheduling your emails, showing them on your dashboard, making them searchable, and posting rate-limit
          alerts to your Slack. Google sign-in requests only your basic profile (<code>openid email profile</code>). Data is never sold, shared or used
          for advertising.
        </p>

        <h2 className="mt-8 text-lg font-semibold">Cookies</h2>
        <p className="mt-2">One httpOnly session cookie keeps you signed in for up to 7 days. No tracking or analytics cookies are used.</p>

        <h2 className="mt-8 text-lg font-semibold">Retention and deletion</h2>
        <p className="mt-2">
          Data is kept while the demo is running. You can disconnect Slack at any time from the profile menu. To have your account and data deleted,
          contact the app owner using the support email shown on the Google sign-in screen.
        </p>
      </article>
    </main>
  );
}
