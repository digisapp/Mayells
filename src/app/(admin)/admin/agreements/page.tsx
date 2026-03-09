'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, FileText, QrCode, ExternalLink, Copy, Check, Download } from 'lucide-react';
import { toast } from 'sonner';

const AGREEMENT_URL = 'https://mayellauctions.com/consignment-agreement';

export default function AdminAgreementsPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setSending(true);
    try {
      const res = await fetch('/api/admin/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientName: name, recipientEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Agreement sent to ${email}`);
      setName('');
      setEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(AGREEMENT_URL);
    setCopied(true);
    toast.success('Link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadQR() {
    const svg = document.getElementById('agreement-qr');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      ctx?.drawImage(img, 0, 0, 512, 512);
      const link = document.createElement('a');
      link.download = 'mayells-consignment-agreement-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Consignment Agreement</h1>
        <a
          href="/consignment-agreement"
          target="_blank"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View Agreement
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Send Agreement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-champagne" />
              Send to Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Client Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Client Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                />
              </div>
              <Button type="submit" variant="champagne" className="w-full" disabled={sending}>
                {sending ? 'Sending...' : 'Send Agreement'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t">
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Or share the link directly
              </label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={AGREEMENT_URL}
                  className="text-xs bg-muted"
                />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-champagne" />
              QR Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Print or display this QR code. Clients can scan it to view the consignment agreement on their phone.
            </p>

            <div className="bg-white rounded-xl p-6 flex flex-col items-center border">
              <QRCodeSVG
                id="agreement-qr"
                value={AGREEMENT_URL}
                size={200}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#272D35"
                imageSettings={{
                  src: '',
                  height: 0,
                  width: 0,
                  excavate: false,
                }}
              />
              <p className="text-xs text-muted-foreground mt-3">
                Scan to view agreement
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full mt-4 gap-2"
              onClick={downloadQR}
            >
              <Download className="h-4 w-4" />
              Download QR Code (PNG)
            </Button>
          </CardContent>
        </Card>

        {/* Agreement Summary */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-champagne" />
              Agreement Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Seller Commission', value: '35%', sub: 'of hammer price' },
                { label: 'Payment Terms', value: '35 days', sub: 'after auction' },
                { label: 'Withdrawal Fee', value: '20%', sub: 'of low estimate' },
                { label: 'Agreement Term', value: '6 months', sub: 'renewable' },
              ].map((item) => (
                <div key={item.label} className="bg-muted/50 rounded-lg p-4">
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
