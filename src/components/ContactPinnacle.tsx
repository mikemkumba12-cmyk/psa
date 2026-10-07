import React, { useState } from 'react';
import { ChevronLeft, MessageSquare, Send, Phone, Mail, MapPin, Clock, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';

interface ContactPinnacleProps {
  onBack: () => void;
}

const categories = [
  { id: 'loan', label: '💰 Loan Enquiry', desc: 'Questions about your loan' },
  { id: 'repayment', label: '📅 Repayment Help', desc: 'Payment issues or schedule' },
  { id: 'docs', label: '📄 Document Help', desc: 'Upload or verification issues' },
  { id: 'account', label: '👤 Account Issue', desc: 'Profile or access problems' },
  { id: 'other', label: '💬 Other', desc: 'General enquiry' },
];

const faqs = [
  { q: 'How long does loan approval take?', a: 'Loan applications are typically reviewed within 24–48 business hours by our credit officers.' },
  { q: 'What is the minimum loan amount?', a: 'The minimum loan amount at Pinnacle MFI is MWK 100,000.' },
  { q: 'How do I repay my loan?', a: 'Repayments can be made via payroll deduction, Airtel Money, TNM Mpamba, or bank transfer.' },
  { q: 'What documents do I need for a loan?', a: 'You need a National ID, latest 3 payslips, and a 3-month bank statement. SMEs also need business registration documents.' },
];

export default function ContactPinnacle({ onBack }: ContactPinnacleProps) {
  const [activeTab, setActiveTab] = useState<'new' | 'faq'>('new');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [ticketId] = useState(`TKT-${Math.floor(Math.random() * 90000) + 10000}`);

  const handleSubmit = () => {
    if (!selectedCategory || !message.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl border border-outline-variant flex items-center justify-center hover:bg-surface-container-low transition-colors">
          <ChevronLeft className="w-4 h-4 text-secondary" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-on-surface">Contact Pinnacle</h2>
          <p className="text-xs text-secondary">We typically respond within 2 hours</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-surface-container rounded-xl p-1 gap-1">
        {[{ id: 'new', label: '📨 New Ticket' }, { id: 'faq', label: '❓ FAQs' }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id ? 'bg-white shadow-sm text-on-surface' : 'text-secondary hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* New Ticket Form */}
      {activeTab === 'new' && !submitted && (
        <div className="space-y-4">
          {/* Category */}
          <div className="bg-white border border-outline-variant rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-on-surface">What can we help with?</h3>
            <div className="space-y-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                    selectedCategory === cat.id
                      ? 'bg-primary-container/5 border-primary-container/40 text-on-surface'
                      : 'border-outline-variant/50 hover:bg-surface-container-low'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedCategory === cat.id ? 'bg-primary-container' : 'bg-outline-variant'}`} />
                  <div>
                    <p className="text-xs font-bold text-on-surface">{cat.label}</p>
                    <p className="text-[10px] text-secondary">{cat.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="bg-white border border-outline-variant rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-on-surface">Describe your issue</h3>
            <textarea
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-3 text-sm text-on-surface placeholder-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary-container/60 resize-none transition-all"
              rows={5}
              placeholder="Please describe your issue or question in detail..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <p className="text-[10px] text-secondary text-right">{message.length}/500 characters</p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!selectedCategory || !message.trim()}
            className={`w-full py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              selectedCategory && message.trim()
                ? 'bg-primary-container text-white hover:brightness-95 active:scale-95'
                : 'bg-surface-container text-secondary cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" /> Send Message to Pinnacle
          </button>
        </div>
      )}

      {/* Success State */}
      {activeTab === 'new' && submitted && (
        <div className="space-y-4">
          <div className="bg-white border border-green-200 rounded-2xl p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-on-surface">Message Sent!</h3>
              <p className="text-xs text-secondary mt-1 leading-relaxed">
                Your support ticket has been created. A Pinnacle officer will contact you shortly.
              </p>
            </div>
            <div className="bg-surface-container-low rounded-xl px-5 py-3 w-full">
              <p className="text-[10px] text-secondary uppercase tracking-widest font-bold">Ticket Reference</p>
              <p className="text-lg font-black text-primary mt-1">{ticketId}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-secondary">
              <Clock className="w-3.5 h-3.5" />
              Expected response within 2 business hours
            </div>
          </div>

          <button
            onClick={() => { setSubmitted(false); setMessage(''); setSelectedCategory(''); }}
            className="w-full py-3.5 rounded-2xl border border-outline-variant text-sm font-bold text-secondary hover:bg-surface-container-low transition-all"
          >
            Send Another Message
          </button>
        </div>
      )}

      {/* FAQs */}
      {activeTab === 'faq' && (
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white border border-outline-variant rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <HelpCircle className="w-4 h-4 text-primary-container flex-shrink-0 mt-0.5" />
                  <p className="text-xs font-bold text-on-surface">{faq.q}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border border-outline-variant flex items-center justify-center flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-45 bg-primary-container border-primary-container' : ''}`}>
                  <span className={`text-sm font-bold leading-none ${openFaq === i ? 'text-white' : 'text-secondary'}`}>+</span>
                </div>
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4 -mt-1">
                  <div className="ml-7 bg-surface-container-low rounded-xl p-3">
                    <p className="text-[11px] text-secondary leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="bg-[#00abf3]/5 border border-[#00abf3]/20 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-[#003c58]">Still need help?</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-primary-container" />
                <p className="text-xs text-secondary">+265 1 234 567 (Mon–Fri 8AM–5PM)</p>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-primary-container" />
                <p className="text-xs text-secondary">support@pinnaclemfi.mw</p>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-primary-container" />
                <p className="text-xs text-secondary">Head Office: City Centre, Lilongwe</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
