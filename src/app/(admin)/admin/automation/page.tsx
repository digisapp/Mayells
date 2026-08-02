'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SlidersHorizontal, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Settings {
  [key: string]: unknown;
  autoInvoiceOnClose: boolean;
  invoiceDueDays: number;
  autoCreateShipment: boolean;
  autoGenerateLabel: boolean;
  requireSignature: boolean;
  requireInsurance: boolean;
  whiteGloveThreshold: number;
  defaultCommissionPercent: number;
  highValueCommissionPercent: number;
  highValueThreshold: number;
  aiEmailAutoReply: boolean;
  autoFollowUpProspects: boolean;
  followUpDelayHours: number;
  followUpUploadReminderHours: number;
  notifySellerOnSale: boolean;
}

export default function AutomationSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/admin/automation')
      .then(res => res.json())
      .then(data => { setSettings(data.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/automation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save settings');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof Settings) {
    if (!settings) return;
    setSettings({ ...settings, [key]: !settings[key] });
  }

  function setNumber(key: keyof Settings, value: string) {
    if (!settings) return;
    setSettings({ ...settings, [key]: parseInt(value) || 0 });
  }

  if (loading || !settings) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="h-8 w-48 bg-muted/30 rounded animate-pulse mb-8" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-muted/30 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <SlidersHorizontal className="h-6 w-6" />
            Automation Settings
          </h1>
          <p className="text-muted-foreground mt-1">Control what AI handles vs what you do manually.</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      {/* Invoicing */}
      <SettingsSection title="Invoicing">
        <Toggle
          label="Auto-generate invoices when auction closes"
          description="Automatically create invoices for winning bidders"
          checked={settings.autoInvoiceOnClose}
          onChange={() => toggle('autoInvoiceOnClose')}
        />
        <NumberInput
          label="Invoice due days"
          value={settings.invoiceDueDays}
          onChange={v => setNumber('invoiceDueDays', String(v))}
          suffix="days after auction"
        />
      </SettingsSection>

      <Separator className="my-8" />

      {/* Shipping */}
      <SettingsSection title="Shipping">
        <Toggle
          label="Auto-create shipment on payment"
          description="Create a shipment record and notify the seller when buyer pays"
          checked={settings.autoCreateShipment}
          onChange={() => toggle('autoCreateShipment')}
        />
        <Toggle
          label="Auto-generate shipping label"
          description="Automatically purchase the cheapest shipping label (requires Shippo API key)"
          checked={settings.autoGenerateLabel}
          onChange={() => toggle('autoGenerateLabel')}
        />
        <Toggle
          label="Require signature on delivery"
          description="All shipments require signature confirmation"
          checked={settings.requireSignature}
          onChange={() => toggle('requireSignature')}
        />
        <Toggle
          label="Require shipping insurance"
          description="All shipments are insured for the hammer price"
          checked={settings.requireInsurance}
          onChange={() => toggle('requireInsurance')}
        />
        <NumberInput
          label="White glove threshold"
          value={settings.whiteGloveThreshold / 100}
          onChange={v => setNumber('whiteGloveThreshold', String(v * 100))}
          prefix="$"
          suffix="items above this get white glove shipping recommendation"
        />
      </SettingsSection>

      <Separator className="my-8" />

      {/* Commission */}
      <SettingsSection title="Commission">
        <NumberInput
          label="Default commission"
          value={settings.defaultCommissionPercent}
          onChange={v => setNumber('defaultCommissionPercent', String(v))}
          suffix="%"
        />
        <NumberInput
          label="High-value commission"
          value={settings.highValueCommissionPercent}
          onChange={v => setNumber('highValueCommissionPercent', String(v))}
          suffix="% — lower rate for high-value items"
        />
        <NumberInput
          label="High-value threshold"
          value={settings.highValueThreshold / 100}
          onChange={v => setNumber('highValueThreshold', String(v * 100))}
          prefix="$"
          suffix="items above this get the lower commission rate"
        />
      </SettingsSection>

      <Separator className="my-8" />

      {/* AI Email */}
      <SettingsSection title="AI Email Replies">
        <Toggle
          label="AI auto-reply to incoming emails"
          description="When ON, AI reads incoming emails, drafts a reply, and sends it automatically. When OFF, AI drafts a reply but you review and click Send manually from the inbox."
          checked={settings.aiEmailAutoReply}
          onChange={() => toggle('aiEmailAutoReply')}
        />
        <p className="text-xs text-muted-foreground ml-1">
          {settings.aiEmailAutoReply
            ? '⚡ Auto-reply is ON — AI will respond to all non-spam emails automatically.'
            : '✋ Manual mode — AI drafts replies in your inbox, you decide when to send.'}
        </p>
      </SettingsSection>

      <Separator className="my-8" />

      {/* Prospect Follow-Up */}
      <SettingsSection title="Prospect Follow-Up">
        <Toggle
          label="Auto follow-up with prospects"
          description="Automatically email prospects who haven't responded after the configured delay"
          checked={settings.autoFollowUpProspects}
          onChange={() => toggle('autoFollowUpProspects')}
        />
        {settings.autoFollowUpProspects && (
          <div className="ml-8 space-y-4 mt-4 p-4 bg-muted/10 rounded-lg border border-border/30">
            <NumberInput
              label="Follow-up delay"
              value={settings.followUpDelayHours}
              onChange={v => setNumber('followUpDelayHours', String(v))}
              suffix="hours before sending first follow-up"
            />
            <NumberInput
              label="Upload reminder delay"
              value={settings.followUpUploadReminderHours}
              onChange={v => setNumber('followUpUploadReminderHours', String(v))}
              suffix="hours before reminding about upload link"
            />
          </div>
        )}
      </SettingsSection>

      <Separator className="my-8" />

      {/* Notifications */}
      <SettingsSection title="Notifications">
        <Toggle label="Notify seller when item sells" checked={settings.notifySellerOnSale} onChange={() => toggle('notifySellerOnSale')} />
      </SettingsSection>

      {/* Bottom save button */}
      <div className="mt-10 flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saved ? 'Saved!' : 'Save All Changes'}
        </Button>
      </div>
    </div>
  );
}

// --- Components ---

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-lg mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label className="text-sm font-medium cursor-pointer" onClick={onChange}>{label}</label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-champagne' : 'bg-muted'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseInt(e.target.value) || 0)}
          className="w-24 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
