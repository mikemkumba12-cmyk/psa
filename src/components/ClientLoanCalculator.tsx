import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Briefcase, AlertOctagon, ChevronRight, CheckCircle2, Upload, FileText } from 'lucide-react';

interface ClientLoanCalculatorProps {
  onBack: () => void;
  onSubmitApplication: (type: string, amount: number, termMonths: number) => void;
}

export default function ClientLoanCalculator({ onBack, onSubmitApplication }: ClientLoanCalculatorProps) {
  const [step, setStep] = useState(1);
  const [loanType, setLoanType] = useState<'personal' | 'business' | 'emergency'>('personal');
  const [amount, setAmount] = useState(250000);
  const [term, setTerm] = useState(6);
  
  // Step 2 uploads
  const [idUploaded, setIdUploaded] = useState(false);
  const [proofUploaded, setProofUploaded] = useState(false);

  // Calculations
  const [monthlyRepayment, setMonthlyRepayment] = useState(0);
  const [totalInterest, setTotalInterest] = useState(0);

  useEffect(() => {
    // simplified formula: (Amount * 1.1) / Term
    const interest = amount * 0.10;
    setTotalInterest(interest);
    const monthly = (amount + interest) / term;
    setMonthlyRepayment(monthly);
  }, [amount, term]);

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (!idUploaded || !proofUploaded) {
        alert("Please upload the required verification documents to proceed.");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      onSubmitApplication(loanType, amount, term);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Top Header */}
      <div className="flex items-center gap-3 border-b border-surface-container pb-4">
        <button 
          onClick={step > 1 ? () => setStep(step - 1) : onBack}
          className="p-1 text-primary hover:bg-surface-container rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-primary">PSA Advisor</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-primary-container' : 'bg-surface-container-highest'}`}></div>
        <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? 'bg-primary-container' : 'bg-surface-container-highest'}`}></div>
        <div className={`h-1.5 flex-1 rounded-full ${step >= 3 ? 'bg-primary-container' : 'bg-surface-container-highest'}`}></div>
        <span className="text-[10px] text-secondary font-bold ml-2 whitespace-nowrap">Step {step} of 3</span>
      </div>

      {step === 1 && (
        <>
          {/* STEP 1: Select type, amount, term */}
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-on-surface mb-0.5">Select Loan Type</h2>
              <p className="text-xs text-secondary">What kind of support do you need today?</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Personal Option */}
              <label 
                onClick={() => setLoanType('personal')}
                className={`relative flex items-center p-4 border rounded-2xl cursor-pointer bg-white transition-all hover:bg-surface-container-low ${
                  loanType === 'personal' ? 'border-primary-container bg-orange-50/10 ring-1 ring-primary-container' : 'border-outline-variant/60'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mr-4">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-on-surface">Personal</span>
                  <span className="text-[10px] text-secondary truncate block">Education, health, or home needs</span>
                </div>
                <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-all ${
                  loanType === 'personal' ? 'border-primary bg-primary-container' : 'border-outline-variant'
                }`}>
                  {loanType === 'personal' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                </div>
              </label>

              {/* Business Option */}
              <label 
                onClick={() => setLoanType('business')}
                className={`relative flex items-center p-4 border rounded-2xl cursor-pointer bg-white transition-all hover:bg-surface-container-low ${
                  loanType === 'business' ? 'border-primary-container bg-orange-50/10 ring-1 ring-primary-container' : 'border-outline-variant/60'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-surface-container-highest text-secondary flex items-center justify-center mr-4">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-on-surface">Business</span>
                  <span className="text-[10px] text-secondary truncate block">Capital for growth and operations</span>
                </div>
                <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-all ${
                  loanType === 'business' ? 'border-primary bg-primary-container' : 'border-outline-variant'
                }`}>
                  {loanType === 'business' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                </div>
              </label>

              {/* Emergency Option */}
              <label 
                onClick={() => setLoanType('emergency')}
                className={`relative flex items-center p-4 border rounded-2xl cursor-pointer bg-white transition-all hover:bg-surface-container-low ${
                  loanType === 'emergency' ? 'border-primary-container bg-orange-50/10 ring-1 ring-primary-container' : 'border-outline-variant/60'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mr-4">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-on-surface">Emergency</span>
                  <span className="text-[10px] text-secondary truncate block">Fast tracking for urgent cases</span>
                </div>
                <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-all ${
                  loanType === 'emergency' ? 'border-primary bg-primary-container' : 'border-outline-variant'
                }`}>
                  {loanType === 'emergency' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                </div>
              </label>
            </div>
          </section>

          {/* Loan Amount & Term Slider */}
          <section className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-on-surface">Loan Amount</label>
                <div className="text-right">
                  <span className="text-[9px] text-secondary block font-medium">Desired amount</span>
                  <div className="text-base font-bold text-primary">K {amount.toLocaleString()}</div>
                </div>
              </div>
              <input 
                type="range" 
                min={10000} 
                max={500000} 
                step={5000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary-container"
              />
              <div className="flex justify-between text-[10px] text-secondary font-bold">
                <span>K 10,000</span>
                <span>K 500,000</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-on-surface">Repayment Term</label>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {[3, 6, 12, 24].map((m) => (
                  <button 
                    key={m}
                    onClick={() => setTerm(m)}
                    className={`whitespace-nowrap px-5 py-2.5 rounded-full border-2 text-xs font-semibold active:scale-95 transition-all ${
                      term === m 
                        ? 'border-primary-container bg-primary-container text-white shadow-sm' 
                        : 'border-outline-variant text-secondary'
                    }`}
                  >
                    {m} Months
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Summary Card */}
          <section className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/60 shadow-sm">
            <h3 className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-3">Estimated Summary</h3>
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-xs text-secondary font-medium">Monthly Repayment</span>
              <span className="text-base font-bold text-on-surface">
                K {monthlyRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-outline-variant">
              <span className="text-[10px] text-secondary font-medium">Total Interest (10%)</span>
              <span className="text-[11px] font-bold text-on-surface">K {totalInterest.toLocaleString()}.00</span>
            </div>
          </section>
        </>
      )}

      {step === 2 && (
        /* STEP 2: Verification Documents Upload */
        <section className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-on-surface mb-0.5">Verification Documents</h2>
            <p className="text-xs text-secondary">Upload high-resolution scans for verification.</p>
          </div>

          <div className="space-y-4">
            {/* ID Document Box */}
            <div className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <FileText className="text-primary w-5 h-5" />
                <div>
                  <h4 className="text-xs font-bold text-on-surface">Government Issued ID</h4>
                  <p className="text-[10px] text-secondary">Passport, Driver's License or National ID card</p>
                </div>
              </div>
              {idUploaded ? (
                <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold">national_id_scan.jpg uploaded</span>
                  <button onClick={() => setIdUploaded(false)} className="text-[10px] font-bold uppercase tracking-wider underline">Remove</button>
                </div>
              ) : (
                <button 
                  onClick={() => setIdUploaded(true)}
                  className="w-full py-3 bg-surface-container-low border border-dashed border-outline-variant/60 rounded-xl text-xs font-bold text-primary flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload ID Copy
                </button>
              )}
            </div>

            {/* Proof of Address Box */}
            <div className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <FileText className="text-primary w-5 h-5" />
                <div>
                  <h4 className="text-xs font-bold text-on-surface">Proof of Physical Address</h4>
                  <p className="text-[10px] text-secondary">Utility bill or bank statement (issued last 3 months)</p>
                </div>
              </div>
              {proofUploaded ? (
                <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold">utility_bill_doc.jpg uploaded</span>
                  <button onClick={() => setProofUploaded(false)} className="text-[10px] font-bold uppercase tracking-wider underline">Remove</button>
                </div>
              ) : (
                <button 
                  onClick={() => setProofUploaded(true)}
                  className="w-full py-3 bg-surface-container-low border border-dashed border-outline-variant/60 rounded-xl text-xs font-bold text-primary flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Utility Bill
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        /* STEP 3: Submit and Confirmation */
        <section className="bg-white border border-outline-variant rounded-2xl p-6 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 bg-green-50 text-green-700 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-on-surface">Confirm Submission</h3>
            <p className="text-xs text-secondary leading-relaxed px-4">
              Your application has been configured with the following estimated parameters. Click below to finalize your submission.
            </p>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 text-left divide-y divide-surface-container">
            <div className="flex justify-between py-2 text-xs">
              <span className="text-secondary font-medium">Loan Category:</span>
              <span className="font-bold text-on-surface uppercase">{loanType}</span>
            </div>
            <div className="flex justify-between py-2 text-xs">
              <span className="text-secondary font-medium">Requested Amount:</span>
              <span className="font-bold text-on-surface">K {amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 text-xs">
              <span className="text-secondary font-medium">Repayment Term:</span>
              <span className="font-bold text-on-surface">{term} Months</span>
            </div>
            <div className="flex justify-between py-2 text-xs">
              <span className="text-secondary font-medium">Monthly Installment:</span>
              <span className="font-bold text-primary">
                K {monthlyRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Action Button */}
      <div className="flex flex-col gap-3">
        <button 
          onClick={handleNext}
          className="h-14 w-full bg-primary-container text-white font-bold text-sm rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
        >
          {step === 3 ? 'Submit Application' : 'Next'}
          <ChevronRight className="w-4 h-4" />
        </button>
        <p className="text-center text-[10px] text-secondary font-medium">Subject to final credit assessment</p>
      </div>
    </div>
  );
}
