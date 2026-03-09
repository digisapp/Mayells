'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Phone, ArrowRight, CheckCircle, FileText, TrendingUp, Home, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { BUSINESS } from '@/lib/config';

const services = [
  {
    icon: FileText,
    title: 'Appraisals & Valuations',
    description: 'USPAP-compliant written appraisals prepared by our in-house specialists and trusted consultants.',
    features: [
      'Estate tax & equitable distribution',
      'Insurance coverage documentation',
      'Financial planning & loan collateral',
      'In-home evaluations available',
      'Free initial consultations',
    ],
  },
  {
    icon: TrendingUp,
    title: 'Sales Advisory',
    description: 'Dedicated account managers guide you to the optimal sale strategy for maximum financial return.',
    features: [
      'Auction vs. private sale vs. gallery guidance',
      'Market analysis & timing recommendations',
      'Competitive auction estimates',
      'Dedicated account manager',
      'Global buyer network access',
    ],
  },
  {
    icon: Home,
    title: 'Estate Services',
    description: 'Comprehensive estate support from single items to entire collections, handled with discretion.',
    features: [
      'Full estate evaluations & liquidation',
      'Removal, logistics & storage',
      'Single items to large-volume properties',
      'Coordination with attorneys & executors',
      'Discreet, confidential handling',
    ],
  },
  {
    icon: Briefcase,
    title: 'Collection Management',
    description: 'Strategic advisory for serious collectors building, maintaining, or transitioning their holdings.',
    features: [
      'Portfolio advisory & insurance documentation',
      'Acquisition guidance & market intelligence',
      'Long-term collection strategy',
      'Authentication & provenance research',
      'Real-time valuation tracking',
    ],
  },
];

const serviceOptions = [
  'Appraisals & Valuations',
  'Sales Advisory',
  'Estate Services',
  'Collection Management',
  'General Inquiry',
];

export default function ServicesPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', service: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/appraisal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        toast.error('Failed to submit. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-charcoal text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-champagne/[0.05] to-transparent pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-2xl">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Advisory</span>
            <h1 className="font-display text-display-xl md:text-[4rem] leading-[1.05] tracking-tight mt-4">
              Professional &<br />
              <span className="text-champagne">Advisor Services</span>
            </h1>
            <p className="mt-6 text-[17px] text-white/60 max-w-lg leading-relaxed">
              Our team of specialists partners with collectors, beneficiaries, attorneys,
              and institutions navigating the art market — delivering tailored solutions
              with expertise and discretion.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <a
                href={BUSINESS.phoneHref}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg px-5 py-3 transition-colors"
              >
                <Phone className="h-4 w-4 text-champagne" />
                <span className="font-semibold text-sm">{BUSINESS.phone}</span>
              </a>
              <span className="text-[12px] text-white/40">Call or text anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="text-center mb-16">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">What We Offer</span>
          <h2 className="font-display text-display-md mt-2">Comprehensive Advisory Services</h2>
          <p className="text-[15px] text-muted-foreground mt-4 max-w-2xl mx-auto leading-relaxed">
            From individual appraisals to full estate management, we accommodate collections of
            every size and complexity with personalized support throughout.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((service) => (
            <div
              key={service.title}
              className="group border border-border/60 rounded-2xl p-8 hover:border-champagne/40 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-champagne/10 flex items-center justify-center mb-6 group-hover:bg-champagne/20 transition-colors duration-300">
                <service.icon className="h-6 w-6 text-champagne" />
              </div>
              <h3 className="font-display text-xl mb-2">{service.title}</h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
                {service.description}
              </p>
              <ul className="space-y-2.5">
                {service.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-champagne flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section className="bg-secondary/40 py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Process</span>
            <h2 className="font-display text-display-md mt-2">How It Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { step: '01', title: 'Reach Out', desc: 'Contact us by phone, email, or through the form below to discuss your needs.' },
              { step: '02', title: 'Consultation', desc: 'A specialist reviews your situation and recommends the best approach.' },
              { step: '03', title: 'Evaluation', desc: 'We examine your items in person or via photographs and provide detailed assessments.' },
              { step: '04', title: 'Action', desc: 'Whether selling, insuring, or planning — we execute the strategy and deliver results.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">{item.step}</span>
                <h3 className="font-display text-lg mt-2 mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form CTA */}
      <section className="bg-charcoal text-white py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left: info */}
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Get Started</span>
              <h2 className="font-display text-display-md sm:text-display-lg leading-tight mt-4">
                Schedule a<br />
                <span className="text-champagne">Consultation</span>
              </h2>
              <p className="mt-4 text-white/60 text-[15px] leading-relaxed max-w-md">
                Whether you have a single item or an entire estate, our team is here to help.
                All consultations are confidential and without obligation.
              </p>

              <div className="mt-10 space-y-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-white/40 mb-1">Phone</p>
                  <a href={BUSINESS.phoneHref} className="text-lg font-semibold hover:text-champagne transition-colors">
                    {BUSINESS.phone}
                  </a>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-white/40 mb-1">Email</p>
                  <a href={`mailto:${BUSINESS.servicesEmail}`} className="text-lg font-semibold hover:text-champagne transition-colors">
                    {BUSINESS.servicesEmail}
                  </a>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-white/40 mb-1">Walk-Ins</p>
                  <p className="text-white/60 text-sm">By appointment. Contact us to schedule.</p>
                </div>
              </div>
            </div>

            {/* Right: form */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 sm:p-8">
              {submitted ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-champagne mx-auto mb-4" />
                  <h3 className="font-display text-xl mb-2">Inquiry Received</h3>
                  <p className="text-white/60 text-sm">
                    A specialist will be in touch within one business day.
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="font-display text-xl mb-1">Request a Consultation</h3>
                  <p className="text-[13px] text-white/50 mb-6">
                    Tell us about your needs — we&apos;ll connect you with the right specialist.
                  </p>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="Full Name"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                      />
                      <input
                        type="email"
                        placeholder="Email Address"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        type="tel"
                        placeholder="Phone Number"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                      />
                      <select
                        value={form.service}
                        onChange={(e) => setForm({ ...form, service: e.target.value })}
                        className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-champagne/50 transition-colors appearance-none"
                      >
                        <option value="" className="bg-charcoal">Service Interest</option>
                        {serviceOptions.map((opt) => (
                          <option key={opt} value={opt} className="bg-charcoal">{opt}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      placeholder="Tell us about your collection, estate, or items..."
                      rows={4}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors resize-none"
                    />
                    <Button type="submit" variant="champagne" size="lg" className="w-full" disabled={submitting}>
                      {submitting ? 'Submitting...' : 'Submit Inquiry'}
                      {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                    <p className="text-[11px] text-white/30 text-center">
                      Confidential. No obligation.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
