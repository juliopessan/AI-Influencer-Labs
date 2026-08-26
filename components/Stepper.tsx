/**
 * The workspace's spine.
 *
 * Every step is always reachable, so the user can go back and change the
 * product photo after reading the script instead of resetting the project.
 * A step that is not ready to be *completed* still opens and explains what is
 * missing — the old UI just disabled the button and said nothing.
 */

import React, { useEffect, useRef } from 'react';
import { StepId, StepState } from '../types';

const CheckMark: React.FC = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StepMarker: React.FC<{ index: number; state: StepState; active: boolean }> = ({
  index,
  state,
  active,
}) => {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold';

  if (state === 'done') {
    return (
      <span className={`${base} border-ok/40 bg-ok/15 text-ok`}>
        <CheckMark />
      </span>
    );
  }
  if (active) {
    return <span className={`${base} border-accent-hover bg-accent text-white`}>{index + 1}</span>;
  }
  return <span className={`${base} border-line-strong bg-surface-2 text-ink-3`}>{index + 1}</span>;
};

export interface StepDescriptor {
  id: StepId;
  label: string;
  state: StepState;
}

export const Stepper: React.FC<{
  steps: ReadonlyArray<StepDescriptor>;
  current: StepId;
  onSelect: (id: StepId) => void;
}> = ({ steps, current, onSelect }) => {
  const activeRef = useRef<HTMLButtonElement>(null);

  // On narrow screens the row scrolls, so a step reached by any means other
  // than a tap — advancing the flow, loading a project — has to bring itself
  // into view or it silently sits off-screen.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current]);

  return (
  <nav aria-label="Etapas da campanha" className="border-b border-line bg-surface-1">
    {/* Horizontal scroll rather than wrapping keeps the row one line tall on
        narrow screens without the header overflowing the viewport. */}
    <ol className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-6">
      {steps.map((step, index) => {
        const active = step.id === current;
        return (
          <li key={step.id} className="shrink-0">
            <button
              type="button"
              ref={active ? activeRef : undefined}
              onClick={() => onSelect(step.id)}
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2.5 whitespace-nowrap border-b-2 px-3 py-3.5 text-sm transition-colors ${
                active
                  ? 'border-accent-hover text-ink'
                  : 'border-transparent text-ink-2 hover:border-line-strong hover:text-ink'
              }`}
            >
              <StepMarker index={index} state={step.state} active={active} />
              <span className={active ? 'font-medium' : ''}>{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
  );
};

/**
 * The bar pinned to the bottom of every step: it always says either what is
 * blocking progress or what the primary action will do — including its cost.
 */
export const StepFooter: React.FC<{
  /** Reason the primary action cannot run yet, if any. */
  blockedBy?: string | null;
  /** Shown when nothing blocks the action. */
  hint?: string;
  children: React.ReactNode;
}> = ({ blockedBy, hint, children }) => (
  <div className="sticky bottom-0 z-20 border-t border-line bg-surface-1/95 backdrop-blur">
    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className={`text-sm ${blockedBy ? 'text-warn' : 'text-ink-2'}`}>{blockedBy ?? hint ?? ''}</p>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  </div>
);
