import clsx from 'clsx';
import { format } from 'date-fns';
import {
  AlignCenter,
  ArrowLeft,
  Bold,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  AlignLeft,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { Textarea } from '../../components/ui/Textarea';
import { errorMessage } from '../../lib/api';
import { RecipientsField, type UploadStats } from './RecipientsField';
import { SendLaterPopover } from './SendLaterPopover';
import { useCreateCampaign, useSenders } from './useCompose';

const labelClass = 'w-[58px] shrink-0 text-[15px] text-ink';

function ToolbarButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={onClick ? label : `${label} (emails are sent as plain text)`}
      aria-label={label}
      disabled={!onClick}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-sm text-ink-muted enabled:hover:bg-hover enabled:hover:text-ink disabled:cursor-default"
    >
      {icon}
    </button>
  );
}

export function ComposePage() {
  const navigate = useNavigate();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const create = useCreateCampaign(idempotencyKey);
  const senders = useSenders();

  const [senderId, setSenderId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [stats, setStats] = useState<UploadStats | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delaySec, setDelaySec] = useState('2');
  const [hourly, setHourly] = useState('200');
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const delayNum = Number(delaySec);
  const hourlyNum = Number(hourly);
  const errors = useMemo(
    () => ({
      recipients: recipients.length === 0 ? 'Add at least one recipient' : null,
      subject: subject.trim().length === 0 ? 'Subject is required' : subject.length > 200 ? 'Subject is too long (max 200)' : null,
      body: body.trim().length === 0 ? 'Body is required' : null,
      delay: delaySec === '' || !Number.isInteger(delayNum) || delayNum < 0 ? 'Whole seconds, 0 or more' : null,
      hourly: hourly === '' || !Number.isInteger(hourlyNum) || hourlyNum < 1 ? 'Whole number, 1 or more' : null,
    }),
    [recipients, subject, body, delaySec, delayNum, hourly, hourlyNum],
  );
  const firstError = Object.values(errors).find(Boolean);
  const valid = !firstError;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid || create.isPending) return;
    create.mutate(
      {
        subject: subject.trim(),
        body,
        recipients,
        startAt: (sendAt ?? new Date()).toISOString(),
        delayMs: delayNum * 1000,
        hourlyLimit: hourlyNum,
        ...(senderId ? { senderId } : {}),
      },
      {
        onSuccess: (r) => {
          const when = r.firstScheduledAt ? format(new Date(r.firstScheduledAt), 'EEE d MMM, h:mm a') : 'now';
          toast.success(`${r.scheduledCount.toLocaleString()} email${r.scheduledCount === 1 ? '' : 's'} scheduled, starting ${when}`);
          const clamped: string[] = [];
          if (r.clamped.delayMs) clamped.push(`delay raised to ${r.effective.delayMs / 1000}s (server minimum)`);
          if (r.clamped.hourlyLimit) clamped.push(`hourly limit capped at ${r.effective.hourlyLimit}/sender (server maximum)`);
          if (clamped.length) toast(`Adjusted: ${clamped.join('; ')}`, { icon: 'ℹ️', duration: 6000 });
          navigate('/dashboard?tab=scheduled');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const exec = (cmd: 'undo' | 'redo') => {
    bodyRef.current?.focus();
    document.execCommand(cmd);
  };

  return (
    <form onSubmit={submit} className="min-h-full bg-surface" noValidate>
      <header className="flex items-center gap-4 px-5 py-6 sm:px-6">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="rounded-sm p-1 text-ink hover:bg-hover">
          <ArrowLeft className="size-6" strokeWidth={1.6} />
        </button>
        <h1 className="flex-1 text-[26px] leading-tight text-ink">Compose New Email</h1>

        <div className="relative flex items-center gap-3">
          <span title="Attachments are not supported" className="flex size-9 items-center justify-center text-ink-subtle" aria-hidden>
            <Paperclip className="size-[22px]" strokeWidth={1.6} />
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-label={sendAt ? `Send time: ${format(sendAt, 'PPpp')}. Change` : 'Pick a send time'}
            aria-expanded={pickerOpen}
            className={clsx('flex size-9 items-center justify-center rounded-pill hover:bg-hover', sendAt ? 'text-brand-600' : 'text-ink-subtle')}
          >
            <Clock3 className="size-[22px]" strokeWidth={1.6} />
          </button>
          <button
            type="submit"
            disabled={!valid || create.isPending}
            title={firstError ?? undefined}
            className="inline-flex h-[38px] min-w-[107px] items-center justify-center gap-2 rounded-pill border border-brand-500 px-5 text-[15px] font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {create.isPending && <Spinner className="size-4" />}
            {sendAt ? 'Send Later' : 'Send'}
          </button>
          <SendLaterPopover
            open={pickerOpen}
            value={sendAt}
            onCancel={() => setPickerOpen(false)}
            onDone={(d) => {
              setSendAt(d);
              setPickerOpen(false);
            }}
          />
        </div>
      </header>

      <div className="mx-auto max-w-[1130px] px-5 pb-16 sm:px-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label htmlFor="compose-from" className={labelClass}>
              From
            </label>
            <div className="relative">
              <select
                id="compose-from"
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="h-[42px] appearance-none rounded-md bg-field pr-10 pl-3 text-[17px] text-ink focus:ring-2 focus:ring-brand-100 focus:outline-none"
              >
                <option value="">All senders (round-robin{senders.data ? ` · ${senders.data.length}` : ''})</option>
                {senders.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle" />
            </div>
          </div>

          <div className="flex items-start gap-4">
            <label htmlFor="compose-to" className={clsx(labelClass, 'pt-3')}>
              To
            </label>
            <div className="min-w-0 flex-1">
              <RecipientsField value={recipients} onChange={setRecipients} stats={stats} onStats={setStats} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label htmlFor="compose-subject" className={labelClass}>
              Subject
            </label>
            <Input id="compose-subject" variant="underline" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={200} className="min-w-0 flex-1" />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
            <div className="flex items-center gap-4">
              <label htmlFor="compose-delay" className="text-[15px]">
                Delay between 2 emails
              </label>
              <Input id="compose-delay" inputMode="numeric" value={delaySec} onChange={(e) => setDelaySec(e.target.value.replace(/\D/g, ''))} placeholder="00" invalid={!!errors.delay} aria-describedby="compose-delay-unit" className="w-[76px]" />
              <span id="compose-delay-unit" className="-ml-2 text-xs text-ink-subtle">
                sec
              </span>
            </div>
            <div className="flex items-center gap-4">
              <label htmlFor="compose-hourly" className="text-[15px]">
                Hourly Limit
              </label>
              <Input id="compose-hourly" inputMode="numeric" value={hourly} onChange={(e) => setHourly(e.target.value.replace(/\D/g, ''))} placeholder="00" invalid={!!errors.hourly} aria-describedby="compose-hourly-unit" className="w-[76px]" />
              <span id="compose-hourly-unit" className="-ml-2 text-xs text-ink-subtle">
                per sender
              </span>
            </div>
            {sendAt && (
              <button type="button" onClick={() => setSendAt(null)} className="ml-auto text-[13px] text-ink-muted hover:text-ink">
                Starts {format(sendAt, 'EEE d MMM, h:mm a')} · <span className="text-brand-600">send now instead</span>
              </button>
            )}
          </div>

          <div className="rounded-lg bg-editor px-4 pt-3 pb-4">
            <div className="mb-2 flex flex-wrap items-center gap-0.5 rounded-pill bg-surface px-2 py-1">
              <ToolbarButton label="Undo" icon={<Undo2 className="size-[18px]" />} onClick={() => exec('undo')} />
              <ToolbarButton label="Redo" icon={<Redo2 className="size-[18px]" />} onClick={() => exec('redo')} />
              <span className="mx-1.5 h-5 w-px bg-line" />
              <ToolbarButton label="Text size" icon={<Type className="size-[18px]" />} />
              <span className="mx-1.5 h-5 w-px bg-line" />
              <ToolbarButton label="Bold" icon={<Bold className="size-[18px]" />} />
              <ToolbarButton label="Italic" icon={<Italic className="size-[18px]" />} />
              <ToolbarButton label="Underline" icon={<Underline className="size-[18px]" />} />
              <span className="mx-1.5 h-5 w-px bg-line" />
              <ToolbarButton label="Align" icon={<AlignCenter className="size-[18px]" />} />
              <ToolbarButton label="Line height" icon={<ChevronsUpDown className="size-[18px]" />} />
              <span className="mx-1.5 h-5 w-px bg-line" />
              <ToolbarButton label="Numbered list" icon={<ListOrdered className="size-[18px]" />} />
              <ToolbarButton label="Bulleted list" icon={<List className="size-[18px]" />} />
              <ToolbarButton label="Indent" icon={<IndentIncrease className="size-[18px]" />} />
              <ToolbarButton label="Outdent" icon={<IndentDecrease className="size-[18px]" />} />
              <ToolbarButton label="Quote" icon={<Quote className="size-[18px]" />} />
              <ToolbarButton label="Align left" icon={<AlignLeft className="size-[18px]" />} />
              <span className="mx-1.5 h-5 w-px bg-line" />
              <ToolbarButton label="Strikethrough" icon={<Strikethrough className="size-[18px]" />} />
            </div>
            <label htmlFor="compose-body" className="sr-only">
              Body
            </label>
            <Textarea id="compose-body" ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type Your Reply..." maxLength={20000} className="min-h-[360px] px-1" />
          </div>
          {firstError && (recipients.length > 0 || subject || body) && <p className="text-xs text-ink-subtle">To schedule: {firstError.toLowerCase()}.</p>}
        </div>
      </div>
    </form>
  );
}
