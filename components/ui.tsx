/**
 * Shared UI primitives.
 *
 * The previous UI repeated long Tailwind strings at every call site, so a
 * button in one panel and a button in another drifted apart. These are the
 * only place those decisions live now.
 */

import React from 'react';

// --- Button -----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border-transparent',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border-line',
  ghost: 'bg-transparent text-ink-2 hover:text-ink hover:bg-surface-2 border-transparent',
  danger: 'bg-transparent text-danger hover:bg-danger/10 border-danger/40',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches the button to its container's width. */
  block?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  block = false,
  className = '',
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center rounded border font-medium transition-colors
      disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-inherit
      ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
    {...props}
  />
);

// --- Panel ------------------------------------------------------------------

export const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => <section className={`panel ${className}`}>{children}</section>;

export const PanelHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
    <div className="min-w-0">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>
);

// --- Form field -------------------------------------------------------------

export const Field: React.FC<{
  label: string;
  htmlFor: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, action, children }) => (
  <div className="space-y-2">
    <div className="flex items-end justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {action}
    </div>
    {children}
    {hint && <p className="text-xs text-ink-3">{hint}</p>}
  </div>
);

// --- Segmented control ------------------------------------------------------

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  label,
  columns = 'auto',
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
  columns?: 'auto' | 2 | 3;
}) {
  // Spelled out rather than interpolated: Tailwind extracts class names
  // statically and would not see `sm:grid-cols-${columns}`.
  const grid =
    columns === 2
      ? 'grid grid-cols-1 sm:grid-cols-2'
      : columns === 3
        ? 'grid grid-cols-1 sm:grid-cols-3'
        : 'flex flex-wrap';

  return (
    <div role="radiogroup" aria-label={label} className={`${grid} gap-2`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded border px-3 py-2.5 text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
              selected
                ? 'border-accent-hover bg-accent/15 text-ink'
                : 'border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink'
            }`}
          >
            <span className="block text-sm font-medium">{option.label}</span>
            {option.description && (
              <span className={`mt-0.5 block text-xs ${selected ? 'text-accent-ink' : 'text-ink-3'}`}>
                {option.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Toggle -----------------------------------------------------------------

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, description, disabled = false }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <p className="text-sm font-medium text-ink">{label}</p>
      {description && <p className="mt-1 text-xs text-ink-3">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
        checked ? 'border-accent-hover bg-accent' : 'border-line-strong bg-surface-3'
      }`}
    >
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-[left] ${
          checked ? 'left-[22px]' : 'left-[3px]'
        }`}
      />
    </button>
  </div>
);

// --- Status -----------------------------------------------------------------

export type StatusTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

const TONE_STYLES: Record<StatusTone, string> = {
  neutral: 'bg-surface-3 text-ink-2 border-line-strong',
  accent: 'bg-accent/15 text-accent-ink border-accent/40',
  ok: 'bg-ok/10 text-ok border-ok/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
};

export const Badge: React.FC<{
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', children, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${TONE_STYLES[tone]} ${className}`}
  >
    {children}
  </span>
);

// --- Notice -----------------------------------------------------------------

export const Notice: React.FC<{
  tone?: StatusTone;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
}> = ({ tone = 'danger', title, children, onDismiss }) => (
  <div className={`animate-rise-in rounded border px-4 py-3 ${TONE_STYLES[tone]}`} role="alert">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-1 text-ink-2' : 'text-ink-2'}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso"
          className="-mr-1 -mt-1 shrink-0 rounded p-1 text-ink-3 transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  </div>
);

// --- Empty state ------------------------------------------------------------

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center rounded border border-dashed border-line px-6 py-12 text-center">
    {icon && <div className="mb-3 text-ink-3">{icon}</div>}
    <p className="text-base font-medium text-ink">{title}</p>
    <p className="mt-1 max-w-sm text-sm text-ink-2">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

// --- Spinner ----------------------------------------------------------------

export const Spinner: React.FC<{ className?: string; label?: string }> = ({
  className = 'h-4 w-4',
  label,
}) => (
  <span className="inline-flex items-center gap-2">
    <svg className={`${className} animate-spin`} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M8 1.5a6.5 6.5 0 016.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
    {label && <span>{label}</span>}
    <span className="sr-only">Carregando</span>
  </span>
);
