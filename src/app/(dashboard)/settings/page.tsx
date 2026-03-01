'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      fullName: formData.get('fullName') as string,
      displayName: formData.get('displayName') as string,
      phone: formData.get('phone') as string,
      shippingAddress: formData.get('shippingAddress') as string,
      shippingCity: formData.get('shippingCity') as string,
      shippingState: formData.get('shippingState') as string,
      shippingZip: formData.get('shippingZip') as string,
      shippingCountry: formData.get('shippingCountry') as string,
    };

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success('Settings saved');
        await refreshProfile();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-display-sm mb-8">Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" name="fullName" defaultValue={profile?.fullName ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input id="displayName" name="displayName" defaultValue={profile?.displayName ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" defaultValue={profile?.email ?? ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={profile?.phone ?? ''} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipping Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shippingAddress">Address</Label>
              <Input id="shippingAddress" name="shippingAddress" defaultValue={profile?.shippingAddress ?? ''} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shippingCity">City</Label>
                <Input id="shippingCity" name="shippingCity" defaultValue={profile?.shippingCity ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingState">State</Label>
                <Input id="shippingState" name="shippingState" defaultValue={profile?.shippingState ?? ''} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shippingZip">ZIP</Label>
                <Input id="shippingZip" name="shippingZip" defaultValue={profile?.shippingZip ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingCountry">Country</Label>
                <Input id="shippingCountry" name="shippingCountry" defaultValue={profile?.shippingCountry ?? ''} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="bg-champagne text-charcoal hover:bg-champagne/90">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}
