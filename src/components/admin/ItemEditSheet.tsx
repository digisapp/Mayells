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
import { Trash2, RefreshCw, Save, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/types';

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
}

interface ItemEditSheetProps {
  item: EstateVisitItem;
  onClose: () => void;
  onSave: (updates: Partial<EstateVisitItem>) => void;
  onDelete: () => void;
  onReprocess: () => void;
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
  const [estimateLow, setEstimateLow] = useState(item.estimateLow ? String(item.estimateLow / 100) : '');
  const [estimateHigh, setEstimateHigh] = useState(item.estimateHigh ? String(item.estimateHigh / 100) : '');

  const handleSave = () => {
    onSave({
      title: title || null,
      description: description || null,
      artist: artist || null,
      period: period || null,
      medium: medium || null,
      dimensions: dimensions || null,
      condition: condition || null,
      conditionNotes: conditionNotes || null,
      suggestedCategory: suggestedCategory || null,
      estimateLow: estimateLow ? Math.round(parseFloat(estimateLow) * 100) : null,
      estimateHigh: estimateHigh ? Math.round(parseFloat(estimateHigh) * 100) : null,
    });
  };

  return (
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
          <div className="rounded-lg overflow-hidden border">
            <img
              src={item.imageUrl}
              alt={item.title || 'Item'}
              className="w-full h-48 object-cover"
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
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Artist / Period row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="artist">Artist / Maker</Label>
              <Input id="artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period">Period</Label>
              <Input id="period" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
          </div>

          {/* Medium / Dimensions row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="medium">Medium</Label>
              <Input id="medium" value={medium} onChange={(e) => setMedium(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dimensions">Dimensions</Label>
              <Input id="dimensions" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={suggestedCategory}
              onChange={(e) => setSuggestedCategory(e.target.value)}
            />
          </div>

          {/* Condition */}
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
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
            <Label htmlFor="conditionNotes">Condition Notes</Label>
            <Textarea
              id="conditionNotes"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Estimates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="estimateLow">Low Estimate ($)</Label>
              <Input
                id="estimateLow"
                type="number"
                value={estimateLow}
                onChange={(e) => setEstimateLow(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimateHigh">High Estimate ($)</Label>
              <Input
                id="estimateHigh"
                type="number"
                value={estimateHigh}
                onChange={(e) => setEstimateHigh(e.target.value)}
                placeholder="0"
              />
            </div>
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
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button variant="outline" size="sm" onClick={onReprocess}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Re-analyze
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="bg-champagne text-charcoal hover:bg-champagne/90"
            onClick={handleSave}
          >
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
