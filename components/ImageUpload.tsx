/**
 * Image picker with a real label, keyboard access and drag-and-drop.
 *
 * The previous version stretched a transparent `<input type="file">` over the
 * card: no label, no focus ring, and the only feedback for an oversized file
 * was a native `alert()`.
 */

import React, { useId, useRef, useState } from 'react';
import { MAX_IMAGE_BYTES } from '../constants';
import { Spinner } from './ui';

const ACCEPTED = 'image/png,image/jpeg,image/webp';

const UploadGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
  </svg>
);

export interface ImageUploadProps {
  label: string;
  /** Shown under the label; also read by screen readers as the field's hint. */
  hint?: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  /** Existing preview, e.g. restored from a saved project. */
  previewUrl: string | null;
  onError: (message: string) => void;
  /** Aspect of the preview frame. */
  aspect?: 'square' | 'video';
  /** Contain instead of cover — right for logos on a plain background. */
  fit?: 'cover' | 'contain';
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  required?: boolean;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  label,
  hint,
  file,
  onSelect,
  previewUrl,
  onError,
  aspect = 'video',
  fit = 'cover',
  busy = false,
  busyLabel,
  disabled = false,
  required = false,
}) => {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!candidate.type.startsWith('image/')) {
      onError(`"${candidate.name}" não é uma imagem.`);
      return;
    }
    if (candidate.size > MAX_IMAGE_BYTES) {
      onError(
        `"${candidate.name}" tem ${(candidate.size / 1024 / 1024).toFixed(1)}MB. O limite é ${Math.round(
          MAX_IMAGE_BYTES / 1024 / 1024
        )}MB.`
      );
      return;
    }
    onSelect(candidate);
  };

  const frame = aspect === 'square' ? 'aspect-square' : 'aspect-video';

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-label="obrigatório">
              *
            </span>
          )}
        </label>
        {file && !disabled && (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="rounded text-xs text-ink-3 transition-colors hover:text-danger"
          >
            Remover
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
        className={`relative overflow-hidden rounded border transition-colors ${frame} ${
          dragging
            ? 'border-accent-hover bg-accent/10'
            : previewUrl
              ? 'border-line-strong bg-surface-2'
              : 'border-dashed border-line bg-surface-2 hover:border-line-strong'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            // Allow re-picking the same file after a rejection.
            e.target.value = '';
          }}
          className="peer sr-only"
        />

        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className={`h-full w-full ${fit === 'contain' ? 'object-contain p-6' : 'object-cover'}`}
          />
        ) : null}

        {/* The label covers the frame so the whole area is clickable, while the
            visually-hidden input keeps the semantics. `peer-focus-visible`
            carries the focus ring back onto the frame, which a `sr-only` input
            could never show on its own. */}
        <label
          htmlFor={inputId}
          className={`absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 rounded text-center transition-colors
            peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-accent-hover ${
              previewUrl ? 'opacity-0 hover:bg-bg/70 hover:opacity-100 peer-focus-visible:opacity-100' : 'text-ink-3 hover:text-ink-2'
            } ${disabled ? 'pointer-events-none' : ''}`}
        >
          <UploadGlyph />
          <span className="px-3 text-xs font-medium">
            {previewUrl ? 'Trocar imagem' : 'Clique ou arraste uma imagem'}
          </span>
        </label>

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/85 text-accent-ink">
            <Spinner className="h-5 w-5" />
            <span className="text-xs font-medium">{busyLabel ?? 'Processando'}</span>
          </div>
        )}
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
};
