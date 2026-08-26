import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

interface HeaderProps {
  credits: number;
  onReset: () => void;
  onSave: () => void;
  onLoad: () => void;
  canLoad: boolean;
}

const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(value);
  // The animation's own cursor. Holding it in a ref lets the effect depend on
  // `value` alone, so one timer runs per credit change.
  const displayRef = useRef(value);

  useEffect(() => {
    if (displayRef.current === value) return;

    const interval = setInterval(() => {
      displayRef.current += Math.sign(value - displayRef.current);
      setDisplayValue(displayRef.current);
      if (displayRef.current === value) clearInterval(interval);
    }, 40);

    return () => clearInterval(interval);
  }, [value]);

  const spending = displayValue > value;

  return (
    <span
      className={`font-mono text-sm font-semibold tabular-nums transition-colors ${
        spending ? 'text-warn' : 'text-ink'
      }`}
    >
      {displayValue}
    </span>
  );
};

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className="flex h-9 w-9 items-center justify-center rounded border border-line bg-surface-2 text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

const Header: React.FC<HeaderProps> = ({ credits, onReset, onSave, onLoad, canLoad }) => (
  <header className="border-b border-line bg-surface-1">
    {/* One row that never overflows: the brand truncates, the controls do not
        shrink. The old header pushed its buttons outside the viewport below
        420px. */}
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent">
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-white" fill="currentColor" aria-hidden="true">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
        </span>
        {/* The wordmark is the first thing to go on a narrow screen; the mark
            alone still identifies the app. */}
        <span className="hidden truncate text-base font-semibold text-ink sm:inline">Influencer Labs</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className="flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2.5 py-1.5"
          title="Créditos restantes"
        >
          <AnimatedCounter value={credits} />
          <span className="hidden text-xs text-ink-3 sm:inline">créditos</span>
        </span>

        <IconButton label="Salvar projeto" onClick={onSave}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 3h9l3 3v11a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" />
            <path d="M6 3v5h7M6 17v-5h8v5" />
          </svg>
        </IconButton>

        <IconButton label="Carregar projeto salvo" onClick={onLoad} disabled={!canLoad}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 6a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" />
          </svg>
        </IconButton>

        <Button size="sm" onClick={onReset}>
          Novo
        </Button>
      </div>
    </div>
  </header>
);

export default Header;
