'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form primitives for the Settings page. There is no shadcn Switch in this
 * project, so Toggle is a hand-rolled `role="switch"` button matching the
 * champagne accent used elsewhere in the admin.
 */

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="divide-y divide-border/60 rounded-lg border bg-card">{children}</div>
    </section>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Rendered below the row, e.g. dependent fields or status copy. */
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={id} className={cn('text-sm font-medium', disabled ? 'opacity-60' : 'cursor-pointer')}>
            {label}
          </label>
          {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
        </div>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            checked ? 'bg-champagne' : 'bg-muted',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
              checked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  /** String state so the input can be emptied while typing. */
  value: string;
  onChange: (next: string) => void;
  /** Rendered left of the input, e.g. "$". */
  prefix?: string;
  /** Rendered right of the input, e.g. "days" or "%". */
  suffix?: string;
  description?: React.ReactNode;
  error?: string;
  min?: number;
  max?: number;
  /** "0.01" for dollar amounts; defaults to whole numbers. */
  step?: string;
  disabled?: boolean;
  inputClassName?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  description,
  error,
  min,
  max,
  step = '1',
  disabled,
  inputClassName,
}: NumberFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="px-4 py-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium">{label}</label>
          {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-2">
            {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
            <input
              id={id}
              type="number"
              inputMode={step === '1' ? 'numeric' : 'decimal'}
              value={value}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => onChange(e.target.value)}
              className={cn(
                'w-28 rounded-md border bg-background px-3 py-1.5 text-sm text-right tabular-nums',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                error ? 'border-red-500' : 'border-border',
                disabled && 'opacity-60',
                inputClassName,
              )}
            />
            {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          </div>
          {error && <p id={errorId} className="text-xs text-red-600 mt-1 sm:text-right">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** Dollar amount field. State is a dollar string; the caller converts to cents on save. */
export function MoneyField(props: Omit<NumberFieldProps, 'prefix' | 'step' | 'min'>) {
  return <NumberField {...props} prefix="$" step="0.01" min={0} inputClassName={cn('w-32', props.inputClassName)} />;
}
