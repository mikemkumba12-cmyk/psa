import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, CheckCircle, Shield, Brain, BarChart3, Smartphone, 
  Users, Building2, TrendingUp, ChevronDown, Star, Phone, Mail, 
  MapPin, Coins, Zap, Lock, Globe, ChevronRight, Menu, X
} from 'lucide-react';

interface MarketingPageProps {
  onEnterApp: () => void;
}

const features = [
  { icon: Brain, title: 'Transparent Rules-Based Scoring', desc: 'The current engine explains configured lending rules and highlights files for officer review.', color: 'text-primary-container', bg: 'bg-primary-container/10' },
  { icon: Shield, title: 'RBM & DPA Compliant', desc: 'Built to Malawi Reserve Bank and Data Protection Authority standards. Your data stays in Malawi.', color: 'text-green-700', bg: 'bg-green-100' },
  { icon: BarChart3, title: 'Executive Intelligence', desc: 'Real-time dashboards give management full visibility into loan portfolio health, risks, and trends.', color: 'text-blue-700', bg: 'bg-blue-100' },
  { icon: Smartphone, title: 'Mobile-First PWA', desc: 'Customers access their loans anytime via a native-like app — no download required. Works offline too.', color: 'text-purple-700', bg: 'bg-purple-100' },
  { icon: Building2, title: 'SME Intelligence', desc: 'Dedicated module for small businesses with a structured Business Health Score from a lending perspective.', color: 'text-amber-700', bg: 'bg-amber-100' },
  { icon: Zap, title: 'Automated Workflows', desc: 'From application to disbursement — automate document verification, repayment tracking, and alerts.', color: 'text-rose-700', bg: 'bg-rose-100' },
];

const stats = [
  { value: '< 2min', label: 'Loan Assessment Time' },
  { value: 'Rules', label: 'Transparent Scoring Basis' },
  { value: '5 Roles', label: 'Staff Access Levels' },
  { value: '100%', label: 'Malawi Data Residency' },
];

const workflow = [
  { step: '01', title: 'Customer Registers', desc: 'Customer creates account via mobile app, uploads National ID and employment documents.' },
  { step: '02', title: 'Rules Engine Assesses Profile', desc: 'PSA scores the customer against configured criteria for risk, income, repayment history, and business health.' },
  { step: '03', title: 'Officer Reviews', desc: 'Pinnacle credit officer receives rules-based guidance, verifies documents, and records the final decision.' },
  { step: '04', title: 'Disbursement & Monitoring', desc: 'Approved loan is disbursed. PSA monitors repayments and flags any emerging risk in real-time.' },
];

const testimonials = [
  { name: 'Grace Kumwenda', role: 'SME Owner, Blantyre', text: 'PSA made getting a business loan so simple. I uploaded my documents and got a decision the same day.' },
  { name: 'John Banda', role: 'Loan Officer, Lilongwe', text: 'The rules-based recommendations help me prioritize files, while the final decision stays with the officer.' },
  { name: 'Dr. Samuel Phiri', role: 'Branch Manager, Zomba', text: 'The executive dashboard gives me portfolio health at a glance. No more spreadsheets.' },
];

export default function MarketingPage({ onEnterApp }: MarketingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const faqs = [
    { q: 'Does PSA replace our current system?', a: 'Yes. PSA is a full end-to-end replacement covering customer management, loan processing, document management, repayment tracking, and executive reporting.' },
    { q: 'Can it work without payroll integration?', a: 'Absolutely. PSA has both a payroll integration mode (when agreements are in place) and a manual repayment recording mode.' },
    { q: 'Is our data safe in Malawi?', a: 'Yes. All data is hosted on Malawi-based servers, complying with both the Reserve Bank of Malawi requirements and the Malawi Data Protection Authority.' },
    { q: 'What if we have no historical loan data for AI training?', a: 'The current release uses a transparent rules-based scoring engine that requires no training data. A trained ML model should only be activated after enough validated PINACO repayment data exists.' },
    { q: 'How long does implementation take?', a: 'Phase 1 MVP is ready for demo immediately. Full deployment with staff training is estimated at 6–8 weeks post-agreement.' },
  ];

  return (
    <div className="bg-[#fcf8f2] min-h-screen font-sans text-on-surface overflow-x-hidden">

      {/* Sticky Navbar */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-lg shadow-sm border-b border-outline-variant/30' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary-container rounded-xl flex items-center justify-center shadow-md">
              <Coins className="text-white w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-lg tracking-tight text-primary block leading-none">Pinnacle</span>
              <span className="text-[9px] font-bold text-secondary uppercase tracking-widest block">Smart Advisor</span>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {['Features', 'How It Works', 'Compliance', 'FAQ'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`} className="text-sm font-semibold text-secondary hover:text-on-surface transition-colors">
                {item}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={onEnterApp} className="text-sm font-bold text-primary hover:underline transition-all">
              Live Demo →
            </button>
            <button className="bg-primary-container text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:brightness-95 transition-all active:scale-95">
              Request Demo
            </button>
          </div>

          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden w-9 h-9 flex items-center justify-center">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-outline-variant px-6 py-4 space-y-4">
            {['Features', 'How It Works', 'FAQ'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`} onClick={() => setMenuOpen(false)} className="block text-sm font-semibold text-secondary">
                {item}
              </a>
            ))}
            <button onClick={onEnterApp} className="w-full bg-primary-container text-white text-sm font-bold py-3 rounded-xl">
              View Live Demo
            </button>
          </div>
        )}
      </header>

      {/* ── HERO SECTION ── */}
      <section className="pt-32 pb-20 px-6 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-primary-container/10 border border-primary-container/20 rounded-full px-4 py-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Now Available for Malawi MFIs</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black text-on-surface leading-tight">
              Smarter Lending.<br />
              <span className="text-primary-container">Transparent lending guidance.</span><br />
              Built for Malawi.
            </h1>

            <p className="text-base text-secondary leading-relaxed max-w-md">
              PSA replaces every spreadsheet, paper form, and legacy system at Pinnacle MFI — with a secure platform that gives officers transparent decision guidance faster.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onEnterApp}
                className="bg-primary-container text-white font-bold px-6 py-3.5 rounded-xl hover:brightness-95 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm shadow-lg shadow-primary-container/30"
              >
                View Live Demo <ArrowRight className="w-4 h-4" />
              </button>
              <button className="border-2 border-outline-variant bg-white font-bold px-6 py-3.5 rounded-xl hover:border-primary/40 transition-all text-sm flex items-center justify-center gap-2">
                Download Brochure
              </button>
            </div>

            <div className="flex items-center gap-6 pt-2">
              {['RBM Compliant', 'DPA Certified', 'Data in Malawi'].map(badge => (
                <div key={badge} className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-semibold text-secondary">{badge}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hero visual — app mockup card */}
          <div className="relative hidden md:block">
            <div className="absolute inset-0 bg-primary-container/10 rounded-3xl blur-3xl" />
            <div className="relative bg-white border border-outline-variant rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">PSA Rules-Based Guidance</p>
                  <p className="text-lg font-black text-on-surface mt-0.5">Samuel Chimwala</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-container-low rounded-xl p-3 text-center">
                  <p className="text-[9px] font-bold text-secondary uppercase">Risk Level</p>
                  <p className="text-sm font-black text-green-600 mt-1">Low</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3 text-center">
                  <p className="text-[9px] font-bold text-secondary uppercase">Confidence</p>
                  <p className="text-sm font-black text-primary mt-1">87%</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-3 text-center">
                  <p className="text-[9px] font-bold text-secondary uppercase">Rule Score</p>
                  <p className="text-sm font-black text-on-surface mt-1">88/100</p>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Recommended Loan</p>
                <p className="text-2xl font-black text-primary mt-1">K 1,500,000</p>
                <div className="space-y-1.5 mt-3">
                  {['Good repayment history', 'Stable income verified', 'Business revenue growing'].map(r => (
                    <div key={r} className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-[11px] text-secondary">{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button className="flex-1 py-2.5 bg-primary-container text-white text-xs font-bold rounded-xl">Review</button>
                <button className="flex-1 py-2.5 border border-outline-variant text-secondary text-xs font-bold rounded-xl">Request Docs</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="bg-primary py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map(s => (
            <div key={s.value} className="text-center">
              <p className="text-3xl font-black text-white">{s.value}</p>
              <p className="text-xs font-semibold text-white/70 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-20 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold text-primary-container uppercase tracking-widest mb-2">Platform Capabilities</p>
          <h2 className="text-3xl font-black text-on-surface">Everything Pinnacle Needs.<br />One Platform.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {features.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-white border border-outline-variant rounded-2xl p-6 space-y-4 hover:shadow-lg hover:-translate-y-0.5 transition-all group">
                <div className={`w-12 h-12 ${f.bg} rounded-2xl flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${f.color}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">{f.title}</h3>
                  <p className="text-xs text-secondary leading-relaxed mt-1">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-20 px-6 bg-surface-container-low">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-primary-container uppercase tracking-widest mb-2">The PSA Workflow</p>
            <h2 className="text-3xl font-black text-on-surface">From Application to Disbursement</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {workflow.map((w, i) => (
              <div key={i} className="bg-white border border-outline-variant rounded-2xl p-6 flex gap-4">
                <div className="w-12 h-12 bg-primary-container rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-container/20">
                  <span className="text-white font-black text-sm">{w.step}</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">{w.title}</h3>
                  <p className="text-xs text-secondary leading-relaxed mt-1">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE ── */}
      <section id="compliance" className="py-20 px-6 max-w-5xl mx-auto">
        <div className="bg-primary rounded-3xl p-10 md:p-14 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white">Built for Malawi's Regulatory Environment</h2>
            <p className="text-sm text-white/80 leading-relaxed">
              PSA is designed from the ground up to comply with Malawi's financial and data regulations.
            </p>
          </div>
          <div className="space-y-4">
            {[
              { title: 'Reserve Bank of Malawi (RBM)', desc: 'Full compliance with MFI lending regulations' },
              { title: 'Malawi Data Protection Authority', desc: 'Data minimization, consent, and rights management' },
              { title: 'Data Residency', desc: 'All data stored on Malawi-based servers' },
              { title: 'Role-Based Access Control', desc: '5 role levels with audit logging on all actions' },
              { title: 'Encryption', desc: 'AES-256 at rest, TLS 1.3 in transit' },
            ].map(c => (
              <div key={c.title} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-white">{c.title}</p>
                  <p className="text-[11px] text-white/70">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-16 px-6 bg-surface-container-low">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold text-primary-container uppercase tracking-widest mb-2">Early Feedback</p>
            <h2 className="text-2xl font-black text-on-surface">What Our Users Say</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map(t => (
              <div key={t.name} className="bg-white border border-outline-variant rounded-2xl p-6 space-y-4">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-primary-container text-primary-container" />)}
                </div>
                <p className="text-xs text-secondary leading-relaxed italic">"{t.text}"</p>
                <div>
                  <p className="text-xs font-bold text-on-surface">{t.name}</p>
                  <p className="text-[10px] text-secondary">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 px-6 max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-bold text-primary-container uppercase tracking-widest mb-2">Common Questions</p>
          <h2 className="text-2xl font-black text-on-surface">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white border border-outline-variant rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left"
              >
                <p className="text-sm font-bold text-on-surface">{faq.q}</p>
                <ChevronDown className={`w-5 h-5 text-secondary flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5">
                  <p className="text-xs text-secondary leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-black text-on-surface">Ready to Transform<br />Pinnacle MFI?</h2>
          <p className="text-sm text-secondary leading-relaxed">
            See the full platform live. Book a personalised demo for your team today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onEnterApp}
              className="bg-primary-container text-white font-bold px-8 py-4 rounded-xl hover:brightness-95 transition-all active:scale-95 text-sm shadow-lg shadow-primary-container/30 flex items-center justify-center gap-2"
            >
              View Live Demo <ArrowRight className="w-4 h-4" />
            </button>
            <button className="border-2 border-outline-variant bg-white font-bold px-8 py-4 rounded-xl hover:border-primary/40 transition-all text-sm">
              Schedule a Meeting
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-outline-variant/30 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-container rounded-xl flex items-center justify-center">
              <Coins className="text-white w-4 h-4" />
            </div>
            <div>
              <span className="font-black text-sm text-primary block leading-none">Pinnacle</span>
              <span className="text-[9px] font-bold text-secondary uppercase tracking-widest">Smart Advisor</span>
            </div>
          </div>
          <p className="text-xs text-secondary text-center">
            © 2026 PSA Platform. Built for Pinnacle Microfinance Institution, Malawi. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="mailto:info@pinnaclemfi.mw" className="text-xs text-secondary hover:text-primary transition-colors">Privacy Policy</a>
            <a href="mailto:info@pinnaclemfi.mw" className="text-xs text-secondary hover:text-primary transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
