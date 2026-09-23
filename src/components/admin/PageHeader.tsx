import { cn } from '@/lib/utils';

/**
 * The one header every admin page uses: title, optional status badges beside
 * it, a one-line description, and actions on the right. Navigation back up the
 * tree lives in the topbar breadcrumb, so pages don't carry their own
 * "Back to …" links.
 */
export function PageHeader({
  title,
  badges,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  /** Status pills shown inline after the title. */
  badges?: React.ReactNode;
  /** One line under the title — what the page is for, or a count. */
  description?: React.ReactNode;
  /** Buttons aligned right (wrap under the title on phones). */
  actions?: React.ReactNode;
  /** Anything that belongs to the header block, e.g. stat tiles. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-display-sm leading-tight break-words">{title}</h1>
            {badges}
          </div>
          {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
