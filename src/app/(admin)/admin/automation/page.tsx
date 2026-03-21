'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SlidersHorizontal, Save, Loader2 } from 'lucide-react';

interface Settings {
  [key: string]: unknown;
  autoApproveConsignments: boolean;
  autoApproveMaxValue: number;
  autoApproveMinConfidence: number;
  autoApproveRequireAddress: boolean;
  aiAutoCatalog: boolean;
  aiAutoAppraise: boolean;
  requireCatalogReview: boolean;
  autoScheduleAuctions: boolean;
  autoScheduleMinLots: number;
  autoScheduleDayOfWeek: number;
  autoScheduleHour: number;
  autoInvoiceOnClose: boolean;
  invoiceDueDays: number;
  autoCreateShipment: boolean;
  autoGenerateLabel: boolean;
  defaultCarrier: string;
  requireSignature: boolean;
  requireInsurance: boolean;
  whiteGloveThreshold: number;
  defaultCommissionPercent: number;
  highValueCommissionPercent: number;
  highValueThreshold: number;
  notifySellerOnApproval: boolean;
  notifySellerOnSale: boolean;
  notifySellerOnShipment: boolean;
  notifyBuyerOnShipment: boolean;
  sendDailyDigest: boolean;
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
    await fetch('/api/admin/automation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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

      {/* AI Cataloging */}
      <SettingsSection title="AI Cataloging & Appraisal">
        <Toggle
          label="Auto-catalog items on consignment"
          description="AI generates title, description, category, and tags from photos"
          checked={settings.aiAutoCatalog}
          onChange={() => toggle('aiAutoCatalog')}
        />
        <Toggle
          label="Auto-appraise items on consignment"
          description="AI estimates value, suggests reserve price, and finds comparable sales"
          checked={settings.aiAutoAppraise}
          onChange={() => toggle('aiAutoAppraise')}
        />
        <Toggle
          label="Require admin review of AI descriptions"
          description="When ON, AI descriptions must be approved before listing. When OFF, they go live automatically."
          checked={settings.requireCatalogReview}
          onChange={() => toggle('requireCatalogReview')}
        />
      </SettingsSection>

      <Separator className="my-8" />

      {/* Auto-Approval */}
      <SettingsSection title="Consignment Auto-Approval">
        <Toggle
          label="Auto-approve consignments"
          description="Automatically approve items below a value threshold when AI confidence is high enough"
          checked={settings.autoApproveConsignments}
          onChange={() => toggle('autoApproveConsignments')}
        />
        {settings.autoApproveConsignments && (
          <div className="ml-8 space-y-4 mt-4 p-4 bg-muted/10 rounded-lg border border-border/30">
            <NumberInput
              label="Max value for auto-approval"
              value={settings.autoApproveMaxValue / 100}
              onChange={v => setNumber('autoApproveMaxValue', String(v * 100))}
              prefix="$"
              suffix="items above this require manual review"
            />
            <NumberInput
              label="Min AI confidence"
              value={settings.autoApproveMinConfidence}
              onChange={v => setNumber('autoApproveMinConfidence', String(v))}
              suffix="% — lower confidence items flagged for review"
            />
            <Toggle
              label="Require seller address before auto-approve"
              description="Ensures shipping can be arranged before listing"
              checked={settings.autoApproveRequireAddress}
              onChange={() => toggle('autoApproveRequireAddress')}
            />
          </div>
        )}
      </SettingsSection>

      <Separator className="my-8" />

      {/* Auction Automation */}
      <SettingsSection title="Auction Automation">
        <Toggle
          label="Auto-schedule auctions"
          description="Automatically create and schedule auctions when enough approved lots accumulate"
          checked={settings.autoScheduleAuctions}
          onChange={() => toggle('autoScheduleAuctions')}
        />
        {settings.autoScheduleAuctions && (
          <div className="ml-8 space-y-4 mt-4 p-4 bg-muted/10 rounded-lg border border-border/30">
            <NumberInput
              label="Minimum lots to trigger"
              value={settings.autoScheduleMinLots}
              onChange={v => setNumber('autoScheduleMinLots', String(v))}
              suffix="approved lots"
            />
            <div className="flex gap-4">
              <div>
                <label className="text-sm font-medium">Day of week</label>
                <select
                  value={settings.autoScheduleDayOfWeek}
                  onChange={e => setNumber('autoScheduleDayOfWeek', e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => (
                    <option key={day} value={i}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Start hour</label>
                <select
                  value={settings.autoScheduleHour}
                  onChange={e => setNumber('autoScheduleHour', e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
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

      {/* Notifications */}
      <SettingsSection title="Notifications">
        <Toggle label="Notify seller on consignment approval" checked={settings.notifySellerOnApproval} onChange={() => toggle('notifySellerOnApproval')} />
        <Toggle label="Notify seller when item sells" checked={settings.notifySellerOnSale} onChange={() => toggle('notifySellerOnSale')} />
        <Toggle label="Notify seller on shipment events" checked={settings.notifySellerOnShipment} onChange={() => toggle('notifySellerOnShipment')} />
        <Toggle label="Notify buyer on shipment events" checked={settings.notifyBuyerOnShipment} onChange={() => toggle('notifyBuyerOnShipment')} />
        <Toggle
          label="Send daily digest to admin"
          description="Morning email summarizing overnight activity, new consignments, and auction results"
          checked={settings.sendDailyDigest}
          onChange={() => toggle('sendDailyDigest')}
        />
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
