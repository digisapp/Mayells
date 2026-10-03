'use client';

import { AlertTriangle, Bot, CheckCheck, Circle, Clock, Reply } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_LABELS } from './types';

const STATUS_STYLES: Record<string, { className: string; label: string; icon?: React.ReactNode }> = {
  received: { className: 'bg-blue-100 text-blue-800', label: 'New', icon: <Circle className="h-2.5 w-2.5 fill-blue-500" /> },
  read: { className: 'bg-gray-100 text-gray-800', label: 'Read' },
  replied: { className: 'bg-green-100 text-green-800', label: 'Replied', icon: <Reply className="h-3 w-3" /> },
  sent: { className: 'bg-champagne/20 text-champagne', label: 'Sent', icon: <Clock className="h-3 w-3" /> },
  delivered: { className: 'bg-green-100 text-green-800', label: 'Delivered', icon: <CheckCheck className="h-3 w-3" /> },
  bounced: { className: 'bg-red-100 text-red-800', label: 'Bounced', icon: <AlertTriangle className="h-3 w-3" /> },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || { className: 'bg-gray-100 text-gray-800', label: status };
  return (
    <Badge variant="secondary" className={`${style.className} gap-1 text-xs`}>
      {style.icon}
      {style.label}
    </Badge>
  );
}

export function CategoryBadge({ category, confidence }: { category: string; confidence?: number | null }) {
  const label = CATEGORY_LABELS[category] || category;
  const confPct = confidence ? Math.round(confidence * 100) : null;
  return (
    <Badge variant="outline" className="gap-1 text-xs border-purple-200 text-purple-700">
      <Bot className="h-2.5 w-2.5" />
      {label}
      {confPct !== null && <span className="text-purple-400">{confPct}%</span>}
    </Badge>
  );
}
