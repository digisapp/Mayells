'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MfaSettings } from '@/components/admin/MfaSettings';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAdminBadges } from '@/hooks/useAdminBadges';
import {
  Receipt,
  Truck,
  Percent,
  Sparkles,
  UserPlus,
  Bell,
  ShieldCheck,
  Save,
  Loader2,
  XCircle,
  ScrollText,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SettingsSection, Toggle, NumberField, MoneyField } from './controls';
import { ConciergeSettings } from './concierge-settings';

export type SettingsTab = 'sales' | 'shipping' | 'commission' | 'ai' | 'prospects' | 'notifications' | 'security';

export const SETTINGS_TABS: ReadonlyArray<{ value: SettingsTab; label: string; icon: typeof Receipt }> = [
  { value: 'sales', label: 'Sales & Invoicing', icon: Receipt },
  { value: 'shipping', label: 'Shipping', icon: Truck },
  { value: 'commission', label: 'Commission', icon: Percent },
  { value: 'ai', label: 'AI', icon: Sparkles },
  { value: 'prospects', label: 'Prospect follow-ups', icon: UserPlus },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'security', label: 'Security', icon: ShieldCheck },
];

/**
 * The settings the API exposes (mirrors the allow-list in
 * src/app/api/admin/automation/route.ts). Inert columns that still exist on
 * the table are deliberately absent:
 *   - autoInvoiceOnClose: there is no manual "create invoice" action, so
 *     turning it off would mark won lots sold with no invoice, no payout and
 *     no shipment — a footgun, not a preference. The cron keeps reading the
 *     column at its default (true).
 *   - autoGenerateLabel / requireInsurance: label purchase needs a Shippo key
 *     that isn't wired up, and every shipment is insured for the hammer
 *     price regardless, so the switches did nothing visible.
 */
interface LiveSettings {
  invoiceDueDays: number | null;
  autoCreateShipment: boolean;
  requireSignature: boolean;
  whiteGloveThreshold: number | null;
  defaultCommissionPercent: number | null;
  highValueCommissionPercent: number | null;
  highValueThreshold: number | null;
  aiEmailAutoReply: boolean;
  autoFollowUpProspects: boolean;
  followUpDelayHours: number | null;
  followUpUploadReminderHours: number | null;
  notifySellerOnSale: boolean;
  notifySellerOnShipment: boolean;
  notifyBuyerOnShipment: boolean;
}

type SettingKey = keyof LiveSettings;

/** How each key is edited and where it lives, so errors can be routed to a tab. */
const FIELDS: Record<SettingKey, { kind: 'bool' | 'int' | 'cents'; label: string; tab: SettingsTab }> = {
  invoiceDueDays: { kind: 'int', label: 'Invoice due days', tab: 'sales' },
  autoCreateShipment: { kind: 'bool', label: 'Auto-create shipment', tab: 'shipping' },
  requireSignature: { kind: 'bool', label: 'Require signature', tab: 'shipping' },
  whiteGloveThreshold: { kind: 'cents', label: 'White-glove threshold', tab: 'shipping' },
  defaultCommissionPercent: { kind: 'int', label: 'Default commission', tab: 'commission' },
  highValueCommissionPercent: { kind: 'int', label: 'High-value commission', tab: 'commission' },
  highValueThreshold: { kind: 'cents', label: 'High-value threshold', tab: 'commission' },
  aiEmailAutoReply: { kind: 'bool', label: 'AI email auto-reply', tab: 'ai' },
  autoFollowUpProspects: { kind: 'bool', label: 'Auto follow-up', tab: 'prospects' },
  followUpDelayHours: { kind: 'int', label: 'Follow-up delay', tab: 'prospects' },
  followUpUploadReminderHours: { kind: 'int', label: 'Upload reminder delay', tab: 'prospects' },
  notifySellerOnSale: { kind: 'bool', label: 'Notify seller on sale', tab: 'notifications' },
  notifySellerOnShipment: { kind: 'bool', label: 'Notify seller on shipment', tab: 'notifications' },
  notifyBuyerOnShipment: { kind: 'bool', label: 'Notify buyer on shipment', tab: 'notifications' },
};
const SETTING_KEYS = Object.keys(FIELDS) as SettingKey[];

/** Booleans as-is; every number as a string so an input can be emptied while typing. */
type FormValues = { [K in SettingKey]: LiveSettings[K] extends boolean ? boolean : string };

function toForm(s: LiveSettings): FormValues {
  const out = {} as Record<SettingKey, boolean | string>;
  for (const key of SETTING_KEYS) {
    const value = s[key];
    switch (FIELDS[key].kind) {
      case 'bool': out[key] = Boolean(value); break;
      case 'int': out[key] = value == null ? '' : String(value); break;
      case 'cents': out[key] = value == null ? '' : (Number(value) / 100).toFixed(2); break;
    }
  }
  return out as FormValues;
}

type Patch = Partial<LiveSettings>;
interface FieldProblem { key: SettingKey; message: string }

/**
 * Only keys whose parsed value differs from what was loaded — so a save is a
 * minimal PATCH and two admins editing different tabs don't clobber each
 * other. Cents-safe: dollars are parsed once and rounded, never multiplied
 * as floats and stored.
 */
function diffForm(form: FormValues, loaded: LiveSettings): { patch: Patch; problems: FieldProblem[] } {
  const patch: Patch = {};
  const problems: FieldProblem[] = [];
  for (const key of SETTING_KEYS) {
    const field = FIELDS[key];
    if (field.kind === 'bool') {
      const next = form[key] as boolean;
      if (next !== loaded[key]) (patch as Record<SettingKey, boolean | number>)[key] = next;
      continue;
    }
    const raw = (form[key] as string).trim();
    if (raw === '') {
      problems.push({ key, message: 'Required' });
      continue;
    }
    const parsed = field.kind === 'cents' ? Math.round(parseFloat(raw) * 100) : parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      problems.push({ key, message: 'Enter a number' });
      continue;
    }
    if (parsed !== loaded[key]) (patch as Record<SettingKey, boolean | number>)[key] = parsed;
  }
  return { patch, problems };
}

interface Meta {
  updatedAt: string | null;
  updatedBy: { id: string; name: string | null } | null;
}

const AUTO_REPLY_CATEGORIES = [
  'appraisal request',
  'consignment inquiry',
  'purchase inquiry',
  'auction question',
  'estate evaluation',
  'scheduling',
  'general inquiry',
];

export function SettingsClient({ initialTab }: { initialTab: SettingsTab }) {
  const adminBadges = useAdminBadges();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [loaded, setLoaded] = useState<LiveSettings | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [meta, setMeta] = useState<Meta>({ updatedAt: null, updatedBy: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<FieldProblem | null>(null);

  const applyResponse = useCallback((body: { data: LiveSettings; updatedAt: string | null; updatedBy: Meta['updatedBy'] }) => {
    setLoaded(body.data);
    setForm(toForm(body.data));
    setMeta({ updatedAt: body.updatedAt ?? null, updatedBy: body.updatedBy ?? null });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/automation');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed to load settings (${res.status})`);
      applyResponse(body);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    load();
  }, [load]);

  const { patch, problems } = useMemo(
    () => (form && loaded ? diffForm(form, loaded) : { patch: {}, problems: [] }),
    [form, loaded],
  );
  const changedCount = Object.keys(patch).length;
  const dirty = changedCount > 0 || problems.length > 0;

  // Don't let a tab close or a sidebar click throw away unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function selectTab(next: string) {
    const value = next as SettingsTab;
    setTab(value);
    // Keep the URL shareable without a server round-trip.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState(null, '', url);
  }

  function setField<K extends SettingKey>(key: K, value: FormValues[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    if (fieldError?.key === key) setFieldError(null);
  }

  async function save() {
    if (!form || !loaded) return;
    if (problems.length > 0) {
      const first = problems[0];
      setFieldError(first);
      setTab(FIELDS[first.key].tab);
      toast.error(`${FIELDS[first.key].label}: ${first.message.toLowerCase()}`);
      return;
    }
    if (changedCount === 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/automation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const path = typeof body.path === 'string' && body.path in FIELDS ? (body.path as SettingKey) : null;
        if (path) {
          setFieldError({ key: path, message: body.error || 'Invalid value' });
          setTab(FIELDS[path].tab);
          toast.error(`${FIELDS[path].label}: ${body.error || 'invalid value'}`);
        } else {
          toast.error(body.error || `Failed to save settings (${res.status})`);
        }
        return;
      }
      applyResponse(body);
      setFieldError(null);
      toast.success(changedCount === 1 ? 'Setting saved' : `${changedCount} settings saved`);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  const errorFor = (key: SettingKey) => (fieldError?.key === key ? fieldError.message : undefined);
  const canSave = !loading && !loadError && !!form && !saving && dirty;

  const lastUpdated = meta.updatedAt
    ? `Last updated${meta.updatedBy?.name ? ` by ${meta.updatedBy.name}` : ''} on ${new Date(meta.updatedAt).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })}`
    : null;

  const failedWebhooks = adminBadges?.webhooks.failed24h ?? 0;

  const saveButton = (size: 'default' | 'lg' = 'default') => (
    <Button onClick={save} disabled={!canSave} size={size}>
      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
      {saving ? 'Saving…' : changedCount > 0 ? `Save ${changedCount === 1 ? 'change' : `${changedCount} changes`}` : 'Save changes'}
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Settings"
        description={
          <>
            <p>What runs automatically, what the house charges, and who gets told.</p>
            {lastUpdated && <p className="text-xs mt-1">{lastUpdated}</p>}
          </>
        }
        actions={
          <>
            {dirty && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700" role="status">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Unsaved changes
              </span>
            )}
            {saveButton()}
          </>
        }
      />

      <Tabs value={tab} onValueChange={selectTab}>
        <div className="overflow-x-auto -mx-1 px-1 pb-1 mb-6 flex items-center gap-2">
          <TabsList>
            {SETTINGS_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon className="h-4 w-4" />
                <span className={cn(value !== tab && 'hidden sm:inline')}>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {/* The webhook delivery log lives at its own route but belongs to Settings. */}
          <Link
            href="/admin/webhooks"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
          >
            <ScrollText className="h-4 w-4" />
            <span className="hidden sm:inline">System log</span>
            {failedWebhooks > 0 && (
              <span
                className="rounded-full bg-red-100 px-1.5 text-[11px] font-semibold tabular-nums text-red-800"
                title={`${failedWebhooks} failed in the last 24 hours`}
              >
                {failedWebhooks}
              </span>
            )}
          </Link>
        </div>

        {/* Security has its own data source; everything else waits for the settings row. */}
        {tab !== 'security' && loading && (
          <div className="space-y-4">
            <div className="h-6 w-48 bg-muted/40 rounded animate-pulse" />
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted/30 rounded-lg animate-pulse" />)}
          </div>
        )}

        {tab !== 'security' && !loading && loadError && (
          <Card>
            <CardContent className="py-12 text-center">
              <XCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">Could not load the current settings.</p>
              <p className="text-xs text-muted-foreground mb-4">{loadError}</p>
              <Button variant="outline" size="sm" onClick={load}>Try again</Button>
              <p className="text-xs text-muted-foreground mt-4">Saving stays disabled until the current values load, so nothing is overwritten blind.</p>
            </CardContent>
          </Card>
        )}

        {form && !loading && !loadError && (
          <>
            <TabsContent value="sales" className="space-y-8">
              <SettingsSection
                title="Invoicing"
                description="Winning bidders are invoiced automatically when a sale closes."
              >
                <NumberField
                  label="Invoice due days"
                  description="Days after the invoice is issued before it counts as overdue."
                  value={form.invoiceDueDays}
                  onChange={(v) => setField('invoiceDueDays', v)}
                  suffix="days"
                  min={1}
                  max={365}
                  error={errorFor('invoiceDueDays')}
                />
              </SettingsSection>
              <SettingsSection title="Buyer's premium">
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  The buyer&rsquo;s premium is set per sale on each auction (default 25%), not globally &mdash; change it on the
                  auction&rsquo;s details before bidding opens. It is added to the hammer price on every invoice.
                </div>
              </SettingsSection>
            </TabsContent>

            <TabsContent value="shipping" className="space-y-8">
              <SettingsSection
                title="Shipping"
                description="How a shipment record is created once a buyer pays."
              >
                <Toggle
                  label="Auto-create shipment on payment"
                  description="Create the shipment record (and notify the seller) as soon as the buyer's invoice is paid. Off means every paid lot waits for you to create one under Shipments."
                  checked={form.autoCreateShipment}
                  onChange={(v) => setField('autoCreateShipment', v)}
                />
                <Toggle
                  label="Require signature on delivery"
                  description="New shipments are created with signature confirmation required."
                  checked={form.requireSignature}
                  onChange={(v) => setField('requireSignature', v)}
                />
                <MoneyField
                  label="White-glove threshold"
                  description="Lots with a hammer price at or above this are created as white-glove shipments instead of standard."
                  value={form.whiteGloveThreshold}
                  onChange={(v) => setField('whiteGloveThreshold', v)}
                  error={errorFor('whiteGloveThreshold')}
                />
              </SettingsSection>
            </TabsContent>

            <TabsContent value="commission" className="space-y-8">
              <SettingsSection
                title="Seller commission"
                description="Applied when a payout is created for a paid lot. A consignment with its own commission rate overrides these."
              >
                <NumberField
                  label="Default commission"
                  value={form.defaultCommissionPercent}
                  onChange={(v) => setField('defaultCommissionPercent', v)}
                  suffix="%"
                  min={0}
                  max={100}
                  error={errorFor('defaultCommissionPercent')}
                />
                <NumberField
                  label="High-value commission"
                  description="Lower rate for lots at or above the threshold below."
                  value={form.highValueCommissionPercent}
                  onChange={(v) => setField('highValueCommissionPercent', v)}
                  suffix="%"
                  min={0}
                  max={100}
                  error={errorFor('highValueCommissionPercent')}
                />
                <MoneyField
                  label="High-value threshold"
                  description="Hammer price at or above which the high-value rate applies."
                  value={form.highValueThreshold}
                  onChange={(v) => setField('highValueThreshold', v)}
                  error={errorFor('highValueThreshold')}
                />
              </SettingsSection>
            </TabsContent>

            <TabsContent value="ai" className="space-y-8">
              <SettingsSection
                title="AI email replies"
                description="Every non-spam inbound email gets an AI-drafted reply in the inbox. This controls whether some of them are sent without you."
              >
                <Toggle
                  label="Send AI replies automatically"
                  description={
                    <>
                      When on, the assistant replies on its own <strong>only</strong> to emails it classifies as{' '}
                      {AUTO_REPLY_CATEGORIES.join(', ')} &mdash; and only at &ge;85% confidence. Everything else (feedback,
                      partnership, support, personal, spam, other, or any lower-confidence match) is drafted for you to review and send.
                      It never auto-replies to no-reply or out-of-office senders, to our own domain, or more than three times in one thread.
                    </>
                  }
                  checked={form.aiEmailAutoReply}
                  onChange={(v) => setField('aiEmailAutoReply', v)}
                >
                  <p className="text-xs text-muted-foreground">
                    {form.aiEmailAutoReply
                      ? 'Auto-reply is on for the categories above. Anything outside them still waits for you in the inbox.'
                      : 'Manual mode: every reply is drafted in the inbox and sent only when you click Send.'}
                  </p>
                </Toggle>
              </SettingsSection>

              <section className="space-y-4">
                <div>
                  <h2 className="font-display text-lg">Chat concierge</h2>
                  <p className="text-sm text-muted-foreground mt-1">The AI chat widget on the public site. Saved separately with its own button.</p>
                </div>
                <ConciergeSettings />
              </section>
            </TabsContent>

            <TabsContent value="prospects" className="space-y-8">
              <SettingsSection
                title="Prospect follow-ups"
                description="Automated nudges to seller prospects who go quiet, sent by the hourly follow-up job."
              >
                <Toggle
                  label="Auto follow-up with prospects"
                  description="Email prospects who haven't responded, and remind those who were sent an upload link but never used it."
                  checked={form.autoFollowUpProspects}
                  onChange={(v) => setField('autoFollowUpProspects', v)}
                />
                <NumberField
                  label="Follow-up delay"
                  description="Hours after a prospect is added with no contact before the first follow-up goes out."
                  value={form.followUpDelayHours}
                  onChange={(v) => setField('followUpDelayHours', v)}
                  suffix="hours"
                  min={1}
                  max={720}
                  disabled={!form.autoFollowUpProspects}
                  error={errorFor('followUpDelayHours')}
                />
                <NumberField
                  label="Upload reminder delay"
                  description="Hours after an upload link is sent, with nothing uploaded, before the reminder goes out."
                  value={form.followUpUploadReminderHours}
                  onChange={(v) => setField('followUpUploadReminderHours', v)}
                  suffix="hours"
                  min={1}
                  max={720}
                  disabled={!form.autoFollowUpProspects}
                  error={errorFor('followUpUploadReminderHours')}
                />
              </SettingsSection>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-8">
              <SettingsSection
                title="Notifications"
                description="Transactional emails sent to buyers and sellers. Invoices and payment receipts are always sent."
              >
                <Toggle
                  label="Notify seller when their lot sells"
                  description="Sends the seller a settlement statement once the buyer has paid."
                  checked={form.notifySellerOnSale}
                  onChange={(v) => setField('notifySellerOnSale', v)}
                />
                <Toggle
                  label="Notify seller when a shipment is created"
                  description="Tells the seller a shipment is ready for their lot, with the label or pickup details."
                  checked={form.notifySellerOnShipment}
                  onChange={(v) => setField('notifySellerOnShipment', v)}
                />
                <Toggle
                  label="Notify buyer when their lot ships"
                  description="Sends the buyer tracking details when the shipment goes out."
                  checked={form.notifyBuyerOnShipment}
                  onChange={(v) => setField('notifyBuyerOnShipment', v)}
                />
              </SettingsSection>
            </TabsContent>

            <div className="mt-8 flex justify-end">{tab !== 'security' && saveButton('lg')}</div>
          </>
        )}

        <TabsContent value="security" className="space-y-8">
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-lg">Security</h2>
              <p className="text-sm text-muted-foreground mt-1">Protect this admin account with a second factor.</p>
            </div>
            <MfaSettings />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
