'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, RefreshCw, Save, AlertCircle, Loader2 } from 'lucide-react';
import { LensButton } from '@/components/admin/LensButton';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

interface EstateVisitItem {
  id: string;
  imageUrl: string;
  sortOrder: number;
  status: string;
  errorMessage: string | null;
  title: string | null;
  description: string | null;
  artist: string | null;
  period: string | null;
  medium: string | null;
  dimensions: string | null;
  condition: string | null;
  conditionNotes: string | null;
  suggestedCategory: string | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  confidence: string | null;
  reasoning: string | null;
  marketTrend: string | null;
  adminNotes: string | null;
}

interface ItemEditSheetProps {
  item: EstateVisitItem;
  onClose: () => void;
  onSave: (updates: Partial<EstateVisitItem>) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onReprocess: () => void | Promise<void>;
}

// Money is stored in cents and edited in dollars. A $0 estimate is a real
// value (the AI can grade something as having no resale value), so both
// directions test for null rather than truthiness.
function centsToDollarsInput(cents: number | null | undefined): string {
  return cents == null ? '' : String(cents / 100);
}

function dollarsInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = parseFloat(trimmed);
  return Number.isNaN(parsed) ? null : Math.round(parsed * 100);
}

export function ItemEditSheet({ item, onClose, onSave, onDelete, onReprocess }: ItemEditSheetProps) {
  const [title, setTitle] = useState(item.title || '');
  const [description, setDescription] = useState(item.description || '');
  const [artist, setArtist] = useState(item.artist || '');
  const [period, setPeriod] = useState(item.period || '');
  const [medium, setMedium] = useState(item.medium || '');
  const [dimensions, setDimensions] = useState(item.dimensions || '');
  const [condition, setCondition] = useState(item.condition || '');
  const [conditionNotes, setConditionNotes] = useState(item.conditionNotes || '');
  const [suggestedCategory, setSuggestedCategory] = useState(item.suggestedCategory || '');
  const [estimateLow, setEstimateLow] = useState(centsToDollarsInput(item.estimateLow));
  const [estimateHigh, setEstimateHigh] = useState(centsToDollarsInput(item.estimateHigh));
  const [adminNotes, setAdminNotes] = useState(item.adminNotes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);
  // Guards against a double PATCH from a second click while the first saves.
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title || null,
        description: description || null,
        artist: artist || null,
        period: period || null,
        medium: medium || null,
        dimensions: dimensions || null,
        condition: condition || null,
        conditionNotes: conditionNotes || null,
        suggestedCategory: suggestedCategory || null,
        estimateLow: dollarsInputToCents(estimateLow),
        estimateHigh: dollarsInputToCents(estimateHigh),
        adminNotes: adminNotes || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg">{item.title || 'Item Details'}</SheetTitle>
            <SheetDescription>
              {item.status === 'error' ? (
                <span className="text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {item.errorMessage || 'Analysis failed'}
                </span>
              ) : item.status === 'completed' ? (
                'AI analysis complete — edit fields below'
              ) : (
                'Pending AI analysis'
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-5 pb-4">
            {/* Image */}
            <div className="rounded-lg overflow-hidden border relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail / local file preview */}
              <img
                src={item.imageUrl}
                alt={item.title || 'Item'}
                className="w-full h-48 object-cover"
              />
              <LensButton
                imageUrl={item.imageUrl}
                className="absolute bottom-2 right-2 bg-background/90"
              />
            </div>

            {/* AI Confidence */}
            {item.confidence && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Confidence: {Math.round(parseFloat(item.confidence) * 100)}%
                </Badge>
                {item.marketTrend && (
                  <Badge variant="outline" className="text-xs capitalize">
                    Market: {item.marketTrend}
                  </Badge>
                )}
              </div>
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="item-title">Title</Label>
              <Input id="item-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="item-description">Description</Label>
              <Textarea
                id="item-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Artist / Period row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-artist">Artist / Maker</Label>
                <Input id="item-artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-period">Period</Label>
                <Input id="item-period" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
            </div>

            {/* Medium / Dimensions row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-medium">Medium</Label>
                <Input id="item-medium" value={medium} onChange={(e) => setMedium(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-dimensions">Dimensions</Label>
                <Input id="item-dimensions" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="item-category">Category</Label>
              <Input
                id="item-category"
                value={suggestedCategory}
                onChange={(e) => setSuggestedCategory(e.target.value)}
              />
            </div>

            {/* Condition */}
            <div className="space-y-1.5">
              <Label htmlFor="item-condition">Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger id="item-condition" className="w-full">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mint">Mint</SelectItem>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="very_good">Very Good</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                  <SelectItem value="as_is">As Is</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Condition Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="item-conditionNotes">Condition Notes</Label>
              <Textarea
                id="item-conditionNotes"
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Estimates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-estimateLow">Low Estimate ($)</Label>
                <Input
                  id="item-estimateLow"
                  type="number"
                  value={estimateLow}
                  onChange={(e) => setEstimateLow(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-estimateHigh">High Estimate ($)</Label>
                <Input
                  id="item-estimateHigh"
                  type="number"
                  value={estimateHigh}
                  onChange={(e) => setEstimateHigh(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Verification Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="item-adminNotes">Verification Notes</Label>
              <Textarea
                id="item-adminNotes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="What Lens/research showed: confirmed maker, comparable listings with prices and links, why the estimate was adjusted…"
              />
              <p className="text-[11px] text-muted-foreground">
                Internal only — not shown on the client report.
              </p>
            </div>

            {/* AI Reasoning */}
            {item.reasoning && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">AI Reasoning</Label>
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                  {item.reasoning}
                </p>
              </div>
            )}
          </div>

          <SheetFooter className="flex-row gap-2 border-t pt-4">
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmReanalyze(true)} disabled={saving}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Re-analyze
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              className="bg-champagne text-charcoal hover:bg-champagne/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmReanalyze}
        onOpenChange={setConfirmReanalyze}
        title="Re-analyze this item?"
        description="Re-analyze will replace the title, description and estimates with a fresh AI analysis, overwriting anything you verified or corrected. Unsaved edits in this panel are discarded. Verification notes are kept."
        confirmLabel="Re-analyze"
        variant="destructive"
        onConfirm={async () => {
          await onReprocess();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this item?"
        description="The photo and its AI analysis are removed from this appraisal and the visit totals are recalculated. This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={async () => {
          await onDelete();
        }}
      />
    </>
  );
}
