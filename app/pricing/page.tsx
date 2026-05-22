import Link from 'next/link';
import { Check, X, MessageSquare, Zap, Building2, ChevronRight } from 'lucide-react';

export const metadata = {
  title: 'Pricing — LifeSync',
  description:
    'Real-time translation calls for every team. Simple, transparent pricing with no hidden fees.',
};

/* ─── Plan data ──────────────────────────────────────────────────── */

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299,
    description: 'Perfect for small teams that need translated calls without complexity.',
    highlight: false,
    badge: null,
    features: [
      '5 team members',
      '500 translated calls / month',
      '10 languages',
      'Phone & video calls',
      'Call recording',
      '7-day call history',
      'Basic analytics',
      'Email support',
    ],
    cta: 'Get started',
    href: '/login',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 599,
    description: 'For growing teams that rely on real-time translation every day.',
    highlight: true,
    badge: 'Most popular',
    features: [
      '20 team members',
      '2,000 translated calls / month',
      '20+ languages',
      'Phone & HD video calls',
      'Call recording + AI transcription',
      '90-day call history',
      'Advanced analytics dashboard',
      'Provider health monitoring',
      'Priority support',
    ],
    cta: 'Start free trial',
    href: '/login',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 999,
    description: 'Unlimited scale with enterprise-grade security and compliance tools.',
    highlight: false,
    badge: null,
    features: [
      'Unlimited team members',
      'Unlimited calls',
      '50+ languages',
      'Phone, HD video & screen share',
      'Recording + transcription + translation',
      'Unlimited call history',
      'Audit log & compliance exports',
      'Custom integrations & webhooks',
      'Dedicated success manager',
      'Custom SLA & contracts',
    ],
    cta: 'Contact sales',
    href: 'mailto:sales@lifesync.app',
  },
] as const;

/* ─── Feature comparison table ───────────────────────────────────── */

const featureRows: {
  label: string;
  starter: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}[] = [
  { label: 'Team members',         starter: '5',            pro: '20',              enterprise: 'Unlimited' },
  { label: 'Calls / month',        starter: '500',          pro: '2,000',           enterprise: 'Unlimited' },
  { label: 'Languages',            starter: '10',           pro: '20+',             enterprise: '50+' },
  { label: 'Phone calls',          starter: true,           pro: true,              enterprise: true },
  { label: 'Video calls',          starter: true,           pro: true,              enterprise: true },
  { label: 'Screen share',         starter: false,          pro: false,             enterprise: true },
  { label: 'Call recording',       starter: true,           pro: true,              enterprise: true },
  { label: 'AI transcription',     starter: false,          pro: true,              enterprise: true },
  { label: 'Translation export',   starter: false,          pro: true,              enterprise: true },
  { label: 'Call history',         starter: '7 days',       pro: '90 days',         enterprise: 'Unlimited' },
  { label: 'Analytics',            starter: 'Basic',        pro: 'Advanced',        enterprise: 'Full + export' },
  { label: 'Audit log',            starter: false,          pro: false,             enterprise: true },
  { label: 'Custom integrations',  starter: false,          pro: false,             enterprise: true },
  { label: 'SSO / SAML',          starter: false,          pro: false,             enterprise: true },
  { label: 'Support',              starter: 'Email',        pro: 'Priority email',  enterprise: 'Dedicated CSM' },
  { label: 'SLA',                  starter: false,          pro: false,             enterprise: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check size={16} className="text-blue-600 mx-auto" />
    ) : (
      <X size={16} className="text-gray-300 mx-auto" />
    );
  }
  return <span className="text-sm text-gray-700">{value}</span>;
}

/* ─── FAQ ─────────────────────────────────────────────────────────── */

const faqs = [
  {
    q: 'What counts as a call?',
    a: 'Any phone or video call made through LifeSync that uses real-time translation counts toward your monthly limit. Calls without translation do not count.',
  },
  {
    q: 'Can I change plans at any time?',
    a: 'Yes. Upgrades take effect immediately; downgrades apply at the start of your next billing cycle. No penalties.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Pro plans come with a 14-day free trial — no credit card required. Starter and Enterprise plans can be discussed with our sales team.',
  },
  {
    q: 'How does team member billing work?',
    a: 'Your plan covers up to the stated seat limit. Adding a new member over that limit triggers a prompt to upgrade. You are only ever billed the flat monthly rate.',
  },
];

/* ─── Page ────────────────────────────────────────────────────────── */

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-gray-900">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <MessageSquare size={14} className="text-white" />
            </div>
            LifeSync
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Get started <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-20 pb-12 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full mb-6">
          <Zap size={12} />
          Simple, transparent pricing
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight max-w-2xl mx-auto leading-tight">
          Break language barriers.<br />
          <span className="text-blue-600">On every call.</span>
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
          Real-time translation for phone and video calls. No interpreters needed.
          One flat monthly price per team.
        </p>
        <p className="mt-3 text-sm text-gray-400">All prices in USD · billed monthly · cancel anytime</p>
      </section>

      {/* Plan cards */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                plan.highlight
                  ? 'bg-blue-600 border-blue-600 text-white shadow-2xl shadow-blue-200 scale-[1.02]'
                  : 'bg-white border-gray-200 shadow-sm'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-400 text-amber-900 text-xs font-bold rounded-full shadow">
                  {plan.badge}
                </span>
              )}

              {/* Plan header */}
              <div className="mb-6">
                <p className={`text-sm font-semibold uppercase tracking-widest mb-1 ${plan.highlight ? 'text-blue-200' : 'text-blue-600'}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-2">
                  <span className={`text-5xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    ${plan.price}
                  </span>
                  <span className={`text-sm pb-1.5 ${plan.highlight ? 'text-blue-200' : 'text-gray-400'}`}>/mo</span>
                </div>
                <p className={`text-sm leading-relaxed ${plan.highlight ? 'text-blue-100' : 'text-gray-500'}`}>
                  {plan.description}
                </p>
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-2.5 mb-8">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                      plan.highlight ? 'bg-blue-500' : 'bg-blue-50'
                    }`}>
                      <Check size={10} className={plan.highlight ? 'text-white' : 'text-blue-600'} />
                    </div>
                    <span className={`text-sm ${plan.highlight ? 'text-blue-50' : 'text-gray-700'}`}>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={plan.href}
                className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-white text-blue-700 hover:bg-blue-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Feature comparison */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Full feature comparison</h2>
        <p className="text-gray-500 text-center text-sm mb-10">See exactly what&apos;s included in each plan</p>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-4 font-semibold text-gray-700 w-[40%]">Feature</th>
                <th className="text-center px-4 py-4 font-semibold text-gray-700">Starter</th>
                <th className="text-center px-4 py-4 font-semibold text-blue-700 bg-blue-50">Pro</th>
                <th className="text-center px-4 py-4 font-semibold text-gray-700">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {featureRows.map((row, i) => (
                <tr
                  key={row.label}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    i === featureRows.length - 1 ? 'border-0' : ''
                  }`}
                >
                  <td className="px-6 py-3.5 text-gray-600 font-medium">{row.label}</td>
                  <td className="px-4 py-3.5 text-center"><Cell value={row.starter} /></td>
                  <td className="px-4 py-3.5 text-center bg-blue-50/40"><Cell value={row.pro} /></td>
                  <td className="px-4 py-3.5 text-center"><Cell value={row.enterprise} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-100 bg-gray-50">
                <td className="px-6 py-4" />
                <td className="px-4 py-4 text-center">
                  <Link href="/login" className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold hover:underline">
                    Get started <ChevronRight size={12} />
                  </Link>
                </td>
                <td className="px-4 py-4 text-center bg-blue-50/40">
                  <Link href="/login" className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold hover:underline">
                    Start trial <ChevronRight size={12} />
                  </Link>
                </td>
                <td className="px-4 py-4 text-center">
                  <a href="mailto:sales@lifesync.app" className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold hover:underline">
                    Contact sales <ChevronRight size={12} />
                  </a>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-6">
          {faqs.map(faq => (
            <div key={faq.q} className="border-b border-gray-100 pb-6 last:border-0">
              <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Building2 size={24} className="text-white" />
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-3">
            Ready to break language barriers?
          </h2>
          <p className="text-blue-100 text-lg mb-8">
            Join teams already using LifeSync for real-time translation on every call.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="px-8 py-3.5 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-colors text-sm"
            >
              Start free trial — Pro plan
            </Link>
            <a
              href="mailto:sales@lifesync.app"
              className="px-8 py-3.5 bg-blue-500/40 text-white font-semibold rounded-xl hover:bg-blue-500/60 transition-colors text-sm border border-white/20"
            >
              Talk to sales
            </a>
          </div>
          <p className="mt-4 text-blue-200 text-xs">No credit card required · 14-day free trial · Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
              <MessageSquare size={12} className="text-white" />
            </div>
            LifeSync
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            <a href="mailto:support@lifesync.app" className="hover:text-white transition-colors">Support</a>
            <a href="mailto:sales@lifesync.app" className="hover:text-white transition-colors">Sales</a>
          </div>
          <p className="text-xs text-gray-600">© {new Date().getFullYear()} LifeSync. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
