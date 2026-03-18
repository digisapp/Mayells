'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function ConciergeTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    personality: '',
    customKnowledge: '',
    upsellItems: '',
    disallowedTopics: '',
    greetingMessage: '',
    enabled: true,
  });

  useEffect(() => {
    fetch('/api/admin/ai-chat-settings')
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setSettings({
            personality: res.data.personality || '',
            customKnowledge: res.data.customKnowledge || '',
            upsellItems: res.data.upsellItems || '',
            disallowedTopics: res.data.disallowedTopics || '',
            greetingMessage: res.data.greetingMessage || '',
            enabled: res.data.enabled ?? true,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-chat-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success('Concierge settings saved');
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-champagne" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-champagne" /> Live Chat Concierge
              </CardTitle>
              <CardDescription>Control how the AI chat widget responds to visitors on your website.</CardDescription>
            </div>
            <button
              onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enabled ? 'bg-champagne' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {!settings.enabled && (
            <p className="text-sm text-red-600 mt-2">Chat is currently disabled. Visitors will not see the chat widget.</p>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personality & Tone</CardTitle>
          <CardDescription>How should the AI sound? Give it a personality.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            placeholder="e.g. Be warm and professional, like a knowledgeable gallery specialist. Use a conversational tone. Mention our Boca Raton showroom when relevant."
            value={settings.personality}
            onChange={(e) => setSettings((s) => ({ ...s, personality: e.target.value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Knowledge</CardTitle>
          <CardDescription>Business facts, hours, policies, or current promotions the AI should reference.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={5}
            placeholder="e.g. Our showroom is open Mon-Fri 10am-6pm. We offer free shipping on purchases over $5,000. Current promotion: 10% reduced commission for first-time consignors through March."
            value={settings.customKnowledge}
            onChange={(e) => setSettings((s) => ({ ...s, customKnowledge: e.target.value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upsell & Promotions</CardTitle>
          <CardDescription>Items or services the AI should naturally mention when relevant.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            placeholder="e.g. Promote our upcoming Spring 2026 Impressionist auction. Mention our free in-home appraisal service in South Florida. Highlight the Boca Raton Fine Jewelry sale."
            value={settings.upsellItems}
            onChange={(e) => setSettings((s) => ({ ...s, upsellItems: e.target.value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restrictions</CardTitle>
          <CardDescription>Topics to avoid or things the AI should never say.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            placeholder="e.g. Don't mention competitor names. Never give specific dollar valuations from photos alone. Don't discuss our commission rates."
            value={settings.disallowedTopics}
            onChange={(e) => setSettings((s) => ({ ...s, disallowedTopics: e.target.value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Welcome Message</CardTitle>
          <CardDescription>Custom greeting shown when visitors open the chat. Leave empty for the default.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Welcome to Mayell! How can we help you today?"
            value={settings.greetingMessage}
            onChange={(e) => setSettings((s) => ({ ...s, greetingMessage: e.target.value }))}
          />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="bg-champagne text-charcoal hover:bg-champagne/90">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Concierge Settings</>}
      </Button>
    </div>
  );
}
