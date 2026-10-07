import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { loadApplications, loadRepayments, loadChats, loadAlerts } from '../lib/dataService';
import { applicationsStore, repaymentsStore, chatsStore, alertsStore } from '../lib/store';
import { platformApi } from '../lib/platformApi';
import { recordAuditEvent } from '../lib/auditTrail';
import { runExpertSystem } from '../lib/intelligenceEngine';
import type { LoanApplication, Repayment, ChatConversation, AlertNotification, ExpertRecommendation } from '../types';

interface ClientContextValue {
  applications: LoanApplication[];
  repayments: Repayment[];
  chats: ChatConversation[];
  alerts: AlertNotification[];
  isLoading: boolean;
  toast: { message: string; type: 'success' | 'info' } | null;
  latestAssessmentModal: {
    application: LoanApplication;
    assessment: ExpertRecommendation;
  } | null;
  closeAssessmentModal: () => void;
  triggerToast: (message: string, type?: 'success' | 'info') => void;
  handlePayInstallment: (id: string) => void;
  handleSubmitApplication: (type: string, amount: number, termMonths: number) => void;
  handleClearUnread: (chatId: string) => void;
  refreshData: () => Promise<void>;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientDataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [latestAssessmentModal, setLatestAssessmentModal] = useState<{
    application: LoanApplication;
    assessment: ExpertRecommendation;
  } | null>(null);

  const closeAssessmentModal = useCallback(() => {
    setLatestAssessmentModal(null);
  }, []);

  const triggerToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const refreshData = useCallback(async () => {
    if (!session?.userId) return;
    setIsLoading(true);
    try {
      const [loadedApps, loadedReps, loadedChats, loadedAlerts] = await Promise.all([
        loadApplications(session.userId),
        loadRepayments(session.userId),
        loadChats(),
        loadAlerts(session.userId),
      ]);
      setApplications(Array.isArray(loadedApps) ? loadedApps : []);
      setRepayments(Array.isArray(loadedReps) ? loadedReps : []);
      setChats(Array.isArray(loadedChats) ? loadedChats : []);
      setAlerts(Array.isArray(loadedAlerts) ? loadedAlerts : []);
    } catch (err) {
      console.error('Failed to load client data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.userId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handlePayInstallment = useCallback((id: string) => {
    repaymentsStore.update(id, { status: 'Paid', paidAt: new Date().toISOString() });
    void platformApi.updateRepayment(id, { status: 'Paid' });
    
    recordAuditEvent({
      actorId: session?.userId || 'client-local',
      actorName: session?.fullName || 'Client User',
      actorRole: 'client',
      action: 'repayment.mark_paid',
      entityType: 'repayment',
      entityId: id,
      outcome: 'success',
      summary: `Repayment installment ${id} processed successfully.`,
      metadata: { status: 'Paid' },
    });

    // Refresh client local state
    if (session?.userId) {
      setRepayments(repaymentsStore.getAll(session.userId));
    }
    triggerToast('Payroll deduction recorded successfully!');
  }, [session, triggerToast]);

  const handleSubmitApplication = useCallback((type: string, amount: number, termMonths: number) => {
    if (!session?.userId) return;
    const newId = `APP-${Math.floor(Math.random() * 90000) + 10000}`;
    
    // Estimate DTI based on income if available
    const monthlyIncome = Number(session.monthlyIncome || 350000);
    const estimatedMonthlyInstallment = amount / termMonths;
    const computedDtiPct = Math.min(Math.round((estimatedMonthlyInstallment / monthlyIncome) * 100), 99);
    
    const draftApplication: LoanApplication = {
      id: newId,
      userId: session.userId,
      applicantName: session.fullName,
      email: session.email,
      phone: session.phone,
      address: session.address || 'Lilongwe',
      businessName: type === 'business' ? `${session.fullName} Enterprises` : '',
      monthlyRevenue: type === 'business' ? monthlyIncome * 1.5 : monthlyIncome,
      staffCount: type === 'business' ? 2 : 0,
      amount,
      termMonths,
      interestRate: 3.5,
      status: 'Under Review',
      sector: type === 'business' ? 'SME' : 'Personal',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      score: 65, // Will be computed by expert system below
      riskLevel: 'Medium',
      repaymentHistory: 'New',
      debtToIncome: `${computedDtiPct}%`,
      yearsInBusiness: type === 'business' ? '1 yr' : 'N/A',
      notes: `Submitted ${termMonths}-month ${type} loan request. Awaiting officer verification.`,
    };

    // Run expert system rules engine to get AI score & recommendation
    const assessment = runExpertSystem(draftApplication);

    const newApplication: LoanApplication = {
      ...draftApplication,
      score: assessment.healthScore.composite,
      riskLevel: assessment.healthScore.composite >= 75 ? 'Low' : assessment.healthScore.composite >= 50 ? 'Medium' : 'High',
    };

    applicationsStore.add(newApplication);
    void platformApi.createApplication(newApplication);

    recordAuditEvent({
      actorId: session.userId,
      actorName: session.fullName,
      actorRole: 'client',
      action: 'loan_application.submit',
      entityType: 'loan_application',
      entityId: newId,
      outcome: 'success',
      summary: `Submitted a ${type} loan application for MWK ${amount.toLocaleString()}. AI Score: ${newApplication.score}/100 (${assessment.verdict}).`,
      metadata: { type, amount, termMonths, status: 'Under Review', aiVerdict: assessment.verdict, aiScore: newApplication.score },
    });

    setApplications(applicationsStore.getAll(session.userId));
    setLatestAssessmentModal({ application: newApplication, assessment });
    triggerToast(`Application #${newId} submitted! Case under review.`);
  }, [session, triggerToast]);

  const handleClearUnread = useCallback((chatId: string) => {
    chatsStore.clearUnread(chatId);
    setChats(chatsStore.getAll());
  }, []);

  return (
    <ClientContext.Provider
      value={{
        applications,
        repayments,
        chats,
        alerts,
        isLoading,
        toast,
        latestAssessmentModal,
        closeAssessmentModal,
        triggerToast,
        handlePayInstallment,
        handleSubmitApplication,
        handleClearUnread,
        refreshData,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClientData() {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useClientData must be used within a ClientDataProvider');
  return context;
}
