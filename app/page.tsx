import Link from 'next/link';
import {
  MessageSquare,
  Phone,
  Video,
  Globe,
  Shield,
  Zap,
  ChevronRight,
  Check,
  Users,
  Mic,
  Clock,
  ArrowRight,
  Star,
} from 'lucide-react';

export const metadata = {
  title: 'LifeSync — Real-Time Translation Calls',
  description:
    'Break language barriers on every call. LifeSync delivers real-time AI translation for phone and video calls so your team can communicate without limits.',
};

/* ─── Data ──────────────────────────────────────────────────────── */

const features = [
  {
    icon: Phone,
    title: 'Phone calls, translated live',
    description:
      'Every word spoken is translated in real time. Your contact hears you in their language. You hear them in yours. No delay. No interpreter.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Video,
    title: 'HD video with captions',
    description:
      'Video calls with live translated captions. Both parties see subtitles in their preferred language while speaking naturally.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Mic,
    title: 'AI transcription + export',
    description:
      'Every call is transcribed and translated automatically. Download the full transcript in both languages for records, compliance, or follow-up.',
    color: 'bg-green-50 text-green-600',
  },
  {
    icon: Shield,
    title: 'End-to-end encrypted',
    description:
      'XChaCha20-Poly1305 encryption on every recording. Encryption keys stored per-conversation. Your conversations stay private.',
    color: 'bg-amber-50 text-amber-600',
  },
];

const steps = [
  {
    n: '01',
    title: 'Set your language',
    body: 'Choose your preferred language in settings. LifeSync remembers it across all calls.',
  },
  {
    n: '02',
    title: 'Call any contact',
    body: 'Find a colleague or customer in Contacts and tap Call. LifeSync detects their language automatically.',
  },
  {
    n: '03',
    title: 'Speak naturally',
    body: 'Talk at your normal pace. Real-time AI translates every word so both parties understand — no scripts, no pauses.',
  },
];

const stats = [
  { value: '50+', label: 'Languages supported' },
  { value: '< 200ms', label: 'Translation latency' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: 'E2E', label: 'Encrypted calls' },
];

const testimonials = [
  {
    quote: 'We closed a deal with a Tokyo supplier in the first week. No interpreter, no scheduling delay — just a call.',
    author: 'Sarah Chen',
    role: 'Head of Procurement',
    initials: 'SC',
    color: 'from-blue-400 to-blue-600',
  },
  {
    quote: 'Our support team serves customers in 12 countries now. LifeSync handles every call like it was in their native language.',
    author: 'Marco Delgado',
    role: 'VP Customer Success',
    initials: 'MD',
    color: 'from-purple-400 to-purple-600',
  },
  {
    quote: 'Onboarding international staff used to take extra weeks for language logistics. That problem is gone.',
    author: 'Priya Nair',
    role: 'HR Director',
    initials: 'PN',
    color: 'from-green-400 to-green-600',
  },
];

/* ─── Page ──────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-gray-900 text-lg">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
              <MessageSquare size={16} className="text-white" />
            </div>
            LifeSync
          </Link>

          <div className="hidden sm:flex items-center gap-7">
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">
              Pricing
            </Link>
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">
              Sign in
            </Link>
          </div>

          <Link
            href="/login"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            Get started <ChevronRight size={14} />
          </Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="pt-24 pb-20 px-6 text-center overflow-hidden relative">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-100/40 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full mb-8 border border-blue-100">
            <Zap size={12} />
            Real-time AI translation · 50+ languages · End-to-end encrypted
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-gray-900 tracking-tight leading-[1.05] mb-6">
            Every call,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-500">
              every language
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-gray-500 max-w-2xl mx-auto leading-relaxed mb-10">
            LifeSync translates phone and video calls in real time so your team can
            communicate with anyone, anywhere — without interpreters.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors text-base shadow-lg shadow-blue-200"
            >
              Start free trial
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 px-8 py-4 bg-white text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-base border border-gray-200 shadow-sm"
            >
              View pricing
            </Link>
          </div>

          <p className="text-sm text-gray-400">
            14-day free trial · No credit card required · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="border-y border-gray-100 bg-gray-50 py-10 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8">
          {stats.map(s => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-gray-900 mb-1">{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
              Built for real-world conversations
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Everything your team needs to communicate across languages, built into one platform.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {features.map(f => (
              <div
                key={f.title}
                className="bg-white border border-gray-100 rounded-2xl p-8 hover:shadow-md transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${f.color}`}>
                  <f.icon size={22} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
              Up and running in minutes
            </h2>
            <p className="text-gray-500 text-lg">No training. No setup calls. Just sign in and start talking.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={step.n} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden sm:block absolute top-6 left-full w-full h-px bg-gradient-to-r from-blue-200 to-transparent z-0" style={{ width: 'calc(100% - 24px)', left: 'calc(50% + 24px)' }} />
                )}
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
                    {step.n}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-12">
            Teams that speak every language
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div
                key={t.author}
                className="bg-white border border-gray-100 rounded-2xl p-7 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-5">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-xs font-bold`}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.author}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Simple, transparent pricing</h2>
          <p className="text-gray-500 mb-8">One flat monthly rate per team. No per-call fees. No surprises.</p>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {[
              { name: 'Starter', price: '$299/mo', note: '5 users · 500 calls' },
              { name: 'Pro', price: '$599/mo', note: '20 users · 2,000 calls', highlight: true },
              { name: 'Enterprise', price: '$999/mo', note: 'Unlimited · custom SLA' },
            ].map(p => (
              <div
                key={p.name}
                className={`rounded-xl p-5 text-center ${
                  p.highlight
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white border border-gray-200'
                }`}
              >
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${p.highlight ? 'text-blue-200' : 'text-blue-600'}`}>
                  {p.name}
                </p>
                <p className={`text-2xl font-extrabold mb-1 ${p.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {p.price.split('/')[0]}
                  <span className={`text-sm font-normal ${p.highlight ? 'text-blue-200' : 'text-gray-400'}`}>/mo</span>
                </p>
                <p className={`text-xs ${p.highlight ? 'text-blue-100' : 'text-gray-500'}`}>{p.note}</p>
              </div>
            ))}
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-blue-600 font-semibold text-sm hover:text-blue-700 transition-colors"
          >
            Compare all features <ChevronRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Globe size={28} className="text-white" />
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4 leading-tight">
            Your next call could be<br />in any language
          </h2>
          <p className="text-blue-100 text-lg mb-8 leading-relaxed">
            Join teams that use LifeSync to communicate without limits.
            14-day free trial included on every Pro plan.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-5">
            <Link
              href="/login"
              className="px-8 py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-colors text-base shadow"
            >
              Start your free trial
            </Link>
            <a
              href="mailto:sales@lifesync.app"
              className="px-8 py-4 bg-blue-500/40 text-white font-semibold rounded-xl hover:bg-blue-500/60 transition-colors text-base border border-white/20"
            >
              Talk to sales
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-blue-200 text-xs">
            {['No credit card required', '14-day free trial', 'Cancel anytime', '99.9% uptime'].map(item => (
              <span key={item} className="flex items-center gap-1">
                <Check size={11} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 py-10 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-2.5 text-white font-bold">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <MessageSquare size={13} className="text-white" />
              </div>
              LifeSync
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-gray-400">
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
              <a href="mailto:support@lifesync.app" className="hover:text-white transition-colors">Support</a>
              <a href="mailto:sales@lifesync.app" className="hover:text-white transition-colors">Sales</a>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-gray-600 text-xs">© {new Date().getFullYear()} LifeSync. All rights reserved.</p>
            <p className="text-gray-700 text-xs">Real-time translation · End-to-end encrypted · GDPR compliant</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
