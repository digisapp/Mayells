import Link from 'next/link';
import { cn } from '@/lib/utils';
import { filterChipClass } from '@/components/admin/PageHeader';

/**
 * The one filter-chip look for admin list pages: small square chips, the
 * active one solid. Renders a button (client-side filters) or a Link
 * (server-rendered pages that filter by searchParam).
 */
export function FilterChip({
  active,
  onClick,
  href,
  className,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = filterChipClass(active, className);
  if (href) {
    return (
      <Link href={href} aria-current={active ? 'page' : undefined} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={classes}>
      {children}
    </button>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: React.ReactNode;
  href?: string;
}

/** A labelled group of FilterChips, one of which is active. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ReadonlyArray<ChipOption<T>>;
  value: T;
  onChange?: (next: T) => void;
  /** Accessible name for the group, e.g. "Filter by status". */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {options.map((o) => (
        <FilterChip
          key={o.value}
          active={o.value === value}
          href={o.href}
          onClick={o.href ? undefined : () => onChange?.(o.value)}
        >
          {o.label}
        </FilterChip>
      ))}
    </div>
  );
}
