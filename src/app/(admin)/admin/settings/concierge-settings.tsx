'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, Save, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ConciergeForm {
  personality: string;
  customKnowledge: string;
  upsellItems: string;
  disallowedTopics: string;
  greetingMessage: string;
  enabled: boolean;
}

const EMPTY: ConciergeForm = {
  personality: '',
  customKnowledge: '',
  upsellItems: '',
  disallowedTopics: '',
  greetingMessage: '',
  enabled: true,
};

/**
 * Live-chat concierge settings (the AI widget on the public site). Its own
 * API (/api/admin/ai-chat-settings) and its own Save button — it is a separate
 * record from the automation settings the rest of the page edits.
 */
export function ConciergeSettings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ConciergeForm>(EMPTY);
  const [saved, setSaved] = useState<ConciergeForm>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/ai-chat-settings');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed to load (${res.status})`);
      // `data` is null until the settings are first saved — defaults are
      // correct then. They are NOT correct on a failed request, which is why
      // the error state below exists instead of silently showing blanks.
      const d = body.data ?? {};
      const next: ConciergeForm = {
        personality: d.personality ?? '',
        customKnowledge: d.customKnowledge ?? '',
        upsellItems: d.upsellItems ?? '',
        disallowedTopics: d.disallowedTopics ?? '',
        greetingMessage: d.greetingMessage ?? '',
        enabled: d.enabled ?? true,
      };
      setForm(next);
      setSaved(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load concierge settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-chat-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.path ? `${body.path}: ${body.error}` : body.error || 'Failed to save concierge settings');
        return;
      }
      const d = body.data ?? {};
      const next: ConciergeForm = {
        personality: d.personality ?? '',
        customKnowledge: d.customKnowledge ?? '',
        upsellItems: d.upsellItems ?? '',
        disallowedTopics: d.disallowedTopics ?? '',
        greetingMessage: d.greetingMessage ?? '',
        enabled: d.enabled ?? true,
      };
      setForm(next);
      setSaved(next);
      toast.success('Concierge settings saved');
    } catch {
      toast.error('Failed to save concierge settings');
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof ConciergeForm>(key: K, value: ConciergeForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-champagne" /> Loading concierge settings…
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">Could not load the concierge settings.</p>
          <p className="text-xs text-muted-foreground mb-4">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          <p className="text-xs text-muted-foreground mt-4">Saving is disabled until the current settings load, so nothing gets overwritten with blanks.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-champagne" /> Live Chat Concierge
              </CardTitle>
              <CardDescription>Control how the AI chat widget responds to visitors on the website.</CardDescription>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              aria-label="Chat widget enabled"
              onClick={() => set('enabled', !form.enabled)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
                form.enabled ? 'bg-champagne' : 'bg-muted',
              )}
            >
              <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', form.enabled ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
          {!form.enabled && (
            <p className="text-sm text-red-600 mt-2">Chat is off — visitors will not see the chat widget.</p>
          )}
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personality &amp; tone</CardTitle>
            <CardDescription>How should the assistant sound?</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              placeholder="e.g. Warm and professional, like a knowledgeable gallery specialist. Conversational. Mention our Palm Beach showroom when relevant."
              value={form.personality}
              onChange={(e) => set('personality', e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custom knowledge</CardTitle>
            <CardDescription>Business facts, hours, policies or current promotions it should reference.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              placeholder="e.g. Showroom open Mon–Fri 10am–6pm. Free shipping on purchases over $5,000. Reduced commission for first-time consignors through March."
              value={form.customKnowledge}
              onChange={(e) => set('customKnowledge', e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upsell &amp; promotions</CardTitle>
            <CardDescription>Items or services it should bring up when relevant.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              placeholder="e.g. Promote the upcoming Impressionist auction. Mention the free in-home appraisal service in South Florida."
              value={form.upsellItems}
              onChange={(e) => set('upsellItems', e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restrictions</CardTitle>
            <CardDescription>Topics to avoid or things it must never say.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              placeholder="e.g. Don't name competitors. Never give dollar valuations from photos alone. Don't discuss commission rates."
              value={form.disallowedTopics}
              onChange={(e) => set('disallowedTopics', e.target.value)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Welcome message</CardTitle>
          <CardDescription>Shown when a visitor opens the chat. Leave empty for the default.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Welcome to Mayells! How can we help you today?"
            value={form.greetingMessage}
            onChange={(e) => set('greetingMessage', e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !dirty} className="bg-champagne text-charcoal hover:bg-champagne/90">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : <><Save className="h-4 w-4 mr-2" />Save concierge settings</>}
        </Button>
        {dirty && <span className="text-xs text-amber-700">Unsaved concierge changes</span>}
      </div>
    </div>
  );
}
