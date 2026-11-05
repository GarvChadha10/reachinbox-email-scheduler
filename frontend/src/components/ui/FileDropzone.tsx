import clsx from 'clsx';
import { FileText, UploadCloud, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';

interface FileDropzoneProps {
  accept: string[]; // extensions incl. dot
  maxBytes: number;
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
  onReject: (reason: string) => void;
  label: string;
  summary?: ReactNode;
}

export function FileDropzone({ accept, maxBytes, file, onFile, onClear, onReject, label, summary }: FileDropzoneProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!accept.includes(ext)) return onReject(`Only ${accept.join(', ')} files are supported`);
    if (f.size > maxBytes) return onReject(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
    onFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2.5">
        <FileText className="size-5 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <div className="text-xs text-ink-muted">{summary}</div>
        </div>
        <button type="button" onClick={onClear} aria-label="Remove file" className="rounded-sm p-1 text-ink-subtle hover:bg-hover hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-5 text-center transition-colors',
          over ? 'border-brand-500 bg-brand-50' : 'border-line-strong hover:border-brand-500 hover:bg-canvas',
        )}
      >
        <UploadCloud className="size-5 text-brand-600" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-ink-subtle">
          Drag & drop or click · {accept.join(', ')} · max {Math.round(maxBytes / 1024 / 1024)} MB
        </span>
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept.join(',')}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
