import { useId, useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { imageFileToPng } from '@/lib/images';

interface Props {
  url: string | null;
  /** New PNG blob, or null to remove the logo. */
  onChange: (blob: Blob | null) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Neutral placeholder shown until the user uploads a logo. */
export function LogoPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-muted ${className}`} aria-hidden>
      <svg viewBox="0 0 40 40" className="size-9 shrink-0" fill="none">
        <rect x="1" y="1" width="38" height="38" rx="8" fill="#F3F5F9" stroke="#C3CAD6" strokeDasharray="3 3" />
        <circle cx="15" cy="15" r="4" fill="#C3CAD6" />
        <path d="M8 31l9-9 6 6 4-4 6 7H8z" fill="#C3CAD6" />
      </svg>
      <span className="text-xs leading-tight">Your logo</span>
    </div>
  );
}

export function LogoPicker({ url, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) return setError('Please choose an image under 5 MB.');
    try {
      onChange(await imageFileToPng(file));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink" id={`${id}-label`}>
        Logo <span className="font-normal text-muted">(optional)</span>
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-44 items-center justify-center rounded-lg border border-dashed border-line bg-[repeating-conic-gradient(#f3f5f9_0%_25%,#fff_0%_50%)] bg-size-[12px_12px] p-2">
          {url ? <img src={url} alt="Current logo" className="max-h-full max-w-full object-contain" /> : <LogoPlaceholder />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} aria-describedby={`${id}-label`}>
            <ImageUp /> {url ? 'Replace' : 'Upload'}
          </Button>
          {url && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          aria-label="Choose a logo image"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : (
        <p className="text-[12.5px] text-muted">
          A transparent PNG works best. It is stored only in this browser (and in your backups), never uploaded anywhere.
        </p>
      )}
    </div>
  );
}
