import clsx from 'clsx';
import { Upload, X } from 'lucide-react';
import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { FileDropzone } from '../../components/ui/FileDropzone';
import { collect, extractEmailsFromFile, tokensIn, type Extraction } from './extractEmails';

const VISIBLE_CHIPS = 3;
const MAX_FILE = 2 * 1024 * 1024;

export interface UploadStats {
  fileName: string;
  added: number;
  invalid: number;
  duplicates: number;
}

interface Props {
  value: string[];
  onChange: (emails: string[]) => void;
  stats: UploadStats | null;
  onStats: (s: UploadStats | null) => void;
}

/** "To" row from the Figma: chips (+N), free typing, and an "Upload List" CSV/TXT importer. */
export function RecipientsField({ value, onChange, stats, onStats }: Props) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [typingError, setTypingError] = useState<string | null>(null);

  const addTokens = (text: string) => {
    const tokens = tokensIn(text);
    if (tokens.length === 0) {
      if (text.trim()) setTypingError(`“${text.trim()}” is not a valid email address`);
      return;
    }
    const r = collect(tokens, value);
    if (r.invalid.length) setTypingError(`Invalid: ${r.invalid.slice(0, 3).join(', ')}`);
    else setTypingError(null);
    if (r.emails.length) onChange([...value, ...r.emails]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ';', ' ', 'Tab'].includes(e.key) && draft.trim()) {
      if (e.key !== 'Tab') e.preventDefault();
      addTokens(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (tokensIn(text).length > 1) {
      e.preventDefault();
      addTokens(text);
    }
  };

  const onFile = async (file: File) => {
    let r: Extraction;
    try {
      r = await extractEmailsFromFile(file, value);
    } catch {
      toast.error('Could not read that file');
      return;
    }
    onChange([...value, ...r.emails]);
    onStats({ fileName: file.name, added: r.emails.length, invalid: r.invalid.length, duplicates: r.duplicates });
    if (r.emails.length === 0) toast.error('No valid email addresses found in that file');
  };

  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <FileDropzone accept={['.csv', '.txt']} maxBytes={MAX_FILE} onFile={(f) => void onFile(f)} onReject={(m) => toast.error(m)}>
      {({ open, dragging }) => (
        <div>
          <div
            className={clsx(
              'flex min-h-[46px] flex-wrap items-center gap-1.5 border-b py-1.5 pl-2.5 transition-colors',
              dragging ? 'rounded-md border-brand-500 bg-brand-50' : 'border-line',
            )}
          >
            {shown.map((email) => (
              <span key={email} className="inline-flex h-[26px] items-center gap-1 rounded-pill border border-brand-500 bg-brand-50 pr-1.5 pl-2.5 text-[15px] text-ink">
                {email}
                <button type="button" aria-label={`Remove ${email}`} onClick={() => onChange(value.filter((v) => v !== email))} className="rounded-full p-0.5 text-ink-subtle hover:bg-brand-100 hover:text-ink">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {hidden > 0 && (
              <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-[26px] items-center rounded-pill border border-brand-500 bg-brand-50 px-2.5 text-[15px] text-ink hover:bg-brand-100" aria-label={`Show ${hidden} more recipients`}>
                +{hidden.toLocaleString()}
              </button>
            )}
            {expanded && value.length > VISIBLE_CHIPS && (
              <button type="button" onClick={() => setExpanded(false)} className="text-xs text-ink-subtle hover:text-ink">
                Show less
              </button>
            )}
            <input
              id="compose-to"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setTypingError(null);
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => draft.trim() && addTokens(draft)}
              placeholder={value.length ? '' : dragging ? 'Drop your CSV / TXT file' : 'recipient@example.com'}
              aria-describedby="compose-to-help"
              className="h-8 min-w-[180px] flex-1 bg-transparent text-[16px] placeholder:text-ink-subtle focus:outline-none"
            />
            <button type="button" onClick={open} className="ml-auto inline-flex h-8 items-center gap-2 rounded-sm px-3 text-[17px] text-brand-600 hover:bg-brand-50">
              <Upload className="size-[18px]" strokeWidth={1.8} />
              Upload List
            </button>
          </div>
          <p id="compose-to-help" className={clsx('mt-1.5 text-xs', typingError ? 'text-danger-600' : 'text-ink-subtle')} aria-live="polite">
            {typingError ??
              (value.length > 0 ? (
                <>
                  <strong className="font-semibold text-ink">{value.length.toLocaleString()}</strong> email address{value.length === 1 ? '' : 'es'} detected
                  {stats && (
                    <>
                      {' '}· {stats.fileName}: {stats.added.toLocaleString()} added
                      {stats.duplicates > 0 && `, ${stats.duplicates.toLocaleString()} duplicate${stats.duplicates === 1 ? '' : 's'} removed`}
                      {stats.invalid > 0 && `, ${stats.invalid.toLocaleString()} invalid skipped`}
                    </>
                  )}
                </>
              ) : (
                'Type addresses, or drop / upload a CSV or TXT list (max 2 MB). Every column is scanned.'
              ))}
          </p>
        </div>
      )}
    </FileDropzone>
  );
}
