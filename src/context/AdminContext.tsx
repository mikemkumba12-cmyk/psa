import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { loadApplications, loadCustomers } from '../lib/dataService';
import { applicationsStore, customersStore, repaymentsStore, alertsStore, payrollStore } from '../lib/store';
import { generateRepaymentSchedule } from '../mock/loans';
import { platformApi } from '../lib/platformApi';
import { recordAuditEvent } from '../lib/auditTrail';
import type { LoanApplication, Customer, AlertNotification } from '../types';

interface AdminContextValue {
  applications: LoanApplication[];
  customers: Customer[];
  dashboardSummary: any;
  selectedAppId: string | null;
  setSelectedAppId: (id: string | null) => void;
  isLoading: boolean;
  // Uses the full LoanApplication status union so 'Pending Doc', 'Reviewing' etc. all type-check
  handleDecision: (appId: string, status: LoanApplication['status'], notes: string) => Promise<void>;
  handleAddCustomer: (customer: Customer) => Promise<void>;
  refreshData: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const summary = await platformApi.getDashboardSummary();
      if (summary) {
        setDashboardSummary(summary);
      } else {
        // High fidelity offline/fallback summary calculation
        const allApps = applicationsStore.getAllUnfiltered();
        const allReps = repaymentsStore.getAllUnfiltered();
        
        const totalDisbursed = allApps
          .filter(a => ['Disbursed', 'Approved', 'Completed'].includes(a.status))
          .reduce((sum, a) => sum + a.amount, 0);

        const totalCollected = allReps
          .filter(r => r.status === 'Paid')
          .reduce((sum, r) => sum + r.amount, 0);

        const activeCount = allApps.filter(a => a.status === 'Disbursed').length;
        const pendingCount = allApps.filter(a => ['Under Review', 'Reviewing', 'In Progress'].includes(a.status)).length;

        setDashboardSummary({
          totalDisbursed,
          totalCollected,
          collectionRate: totalDisbursed ? Math.round((totalCollected / totalDisbursed) * 100) : 100,
          totalInterestEarned: Math.round(totalCollected * 0.15),
          pendingCount,
          activeCount,
          totalApplications: allApps.length,
          recentAuditActivity: [],
        });
      }
    } catch (err) {
      console.warn('Failed to load dashboard summary:', err);
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (!session?.userId) return;
    setIsLoading(true);
    try {
      const [loadedApps, loadedCusts] = await Promise.all([
        loadApplications(),
        loadCustomers(),
      ]);
      setApplications(Array.isArray(loadedApps) ? loadedApps : []);
      setCustomers(Array.isArray(loadedCusts) ? loadedCusts : []);
      await loadSummary();
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.userId, loadSummary]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleDecision = useCallback(async (appId: string, status: any, notes: string) => {
    applicationsStore.update(appId, { status, notes });
    await platformApi.updateApplication(appId, { status, notes });

    // Dynamic schedule, customer active loan update, and payroll deduction entry on Approval
    if (status === 'Approved' || status === 'Disbursed') {
      const fullApps = applicationsStore.getAllUnfiltered();
      const app = fullApps.find(a => a.id === appId);
      if (app) {
        const updatedApp = {
          ...app,
          status,
          disbursedAt: new Date().toISOString().split('T')[0],
        };
        const generatedRepayments = generateRepaymentSchedule(updatedApp);
        repaymentsStore.addMultiple(generatedRepayments);

        // 1. Update customer active loans count and status in store & backend
        const allCusts = customersStore.getAll();
        const matchedCust = allCusts.find(c => c.userId === app.userId || c.name === app.applicantName);
        if (matchedCust) {
          const patch = {
            activeLoans: (matchedCust.activeLoans || 0) + 1,
            status: 'Active' as const,
          };
          customersStore.update(matchedCust.id, patch);
          void platformApi.createCustomer({ ...matchedCust, ...patch });
        }

        // 2. Automatically generate a payroll deduction record for employer tracking
        if (generatedRepayments.length > 0) {
          const firstRep = generatedRepayments[0];
          payrollStore.addRecords([{
            id: `pay-${Date.now()}`,
            batchId: `batch-auto-${Date.now()}`,
            employeeId: matchedCust?.employeeNumber || `EMP-${app.id}`,
            customerName: app.applicantName,
            customerId: matchedCust?.id || app.userId,
            employer: app.businessName || matchedCust?.sector || 'Partner Employer',
            amount: firstRep.amount,
            month: new Date().toISOString().slice(0, 7),
            status: 'Matched',
            repaymentId: firstRep.id,
          }]);
        }
      }
    }

    // ── Phase 4: Record officer decision in AI governance audit trail ─────────
    const govApp = applicationsStore.getAllUnfiltered().find(a => a.id === appId);
    if (govApp) {
      // Map display status to AI recommendation format
      const aiRecMap: Record<string, string> = {
        Approved: 'Approve', Decline: 'Decline', 'Under Review': 'Review',
        'In Progress': 'Review', Disbursed: 'Approve', 'Pending Doc': 'Review',
      };
      const aiRec = aiRecMap[govApp.status] ?? 'Review';
      const officerDec = aiRecMap[status] ?? status;
      await platformApi.recordGovernanceDecision({
        applicationId: appId,
        aiRecommendation: aiRec,
        aiConfidence: govApp.score ?? 75,
        aiSignals: [],
        officerId: session?.userId || 'staff-local',
        officerDecision: officerDec,
        overrideReason: notes || undefined,
      });
    }

    const alert: AlertNotification = {
      id: `alert-${Date.now()}`,
      userId: applicationsStore.getAllUnfiltered().find(a => a.id === appId)?.userId,
      type: status === 'Approved' ? 'approval' : 'critical',
      title: status === 'Approved' ? 'Loan Application Approved' : 'Application Update',
      description: `Application ${appId} status: ${status}. ${notes || ''}`,
      date: new Date().toLocaleDateString(),
    };

    alertsStore.add(alert);
    await platformApi.createAlert(alert);

    recordAuditEvent({
      actorId: session?.userId || 'staff-local',
      actorName: session?.fullName || 'Staff User',
      actorRole: 'staff',
      action: 'loan_application.decision',
      entityType: 'loan_application',
      entityId: appId,
      outcome: 'success',
      summary: `Staff changed application ${appId} status to ${status}.`,
      metadata: { status, notes },
    });

    setApplications(applicationsStore.getAll());
    setSelectedAppId(null);
    await loadSummary();
  }, [session, loadSummary]);

  const handleAddCustomer = useCallback(async (customer: Customer) => {
    customersStore.add(customer);
    await platformApi.createCustomer(customer);

    recordAuditEvent({
      actorId: session?.userId || 'staff-local',
      actorName: session?.fullName || 'Staff User',
      actorRole: 'staff',
      action: 'customer.create',
      entityType: 'customer',
      entityId: customer.id,
      outcome: 'success',
      summary: `Registered new customer profile: ${customer.name}.`,
      metadata: { sector: customer.sector, riskLevel: customer.riskLevel },
    });

    setCustomers(customersStore.getAll());
    await loadSummary();
  }, [session, loadSummary]);

  return (
    <AdminContext.Provider
      value={{
        applications,
        customers,
        dashboardSummary,
        selectedAppId,
        setSelectedAppId,
        isLoading,
        handleDecision,
        handleAddCustomer,
        refreshData,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdminData must be used within an AdminDataProvider');
  return context;
}
