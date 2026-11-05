import clsx from 'clsx';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';

interface FileDropzoneProps {
  accept: string[]; // extensions incl. dot
  maxBytes: number;
  onFile: (file: File) => void;
  onReject: (reason: string) => void;
  /** Render prop: `open()` opens the file picker (e.g. from an "Upload List" button). */
  children: (api: { open: () => void; dragging: boolean }) => ReactNode;
  className?: string;
}

/** Drag-and-drop + click file input with client-side type/size checks. */
export function FileDropzone({ accept, maxBytes, onFile, onReject, children, className }: FileDropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!accept.includes(ext)) return onReject(`Only ${accept.join(' / ')} files are supported`);
    if (f.size > maxBytes) return onReject(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
    onFile(f);
  };

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files[0]);
      }}
      className={clsx('relative', className)}
    >
      {children({ open: () => input.current?.click(), dragging })}
      <input
        ref={input}
        type="file"
        accept={accept.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
