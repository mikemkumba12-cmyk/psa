import { seedCustomers } from './src/mock/customers';
import { seedLoanApplications, generateRepaymentSchedule } from './src/mock/loans';

console.log('--- CUSTOMERS WITH LOANS SUMMARY ---');

const activeLoansList = seedLoanApplications.filter(app => 
  ['Disbursed', 'Approved', 'Under Review', 'In Progress', 'Completed'].includes(app.status)
);

const customerLoanMap = new Map();

for (const app of seedLoanApplications) {
  const cust = seedCustomers.find(c => c.userId === app.userId || c.name.toLowerCase() === app.applicantName.toLowerCase());
  
  // calculate expected monthly repayment installment
  const termMonths = app.termMonths || 12;
  const rate = (app.interestRate || 3.5) / 100;
  const principal = app.amount;
  const monthlyPrincipal = Math.round(principal / termMonths);
  const monthlyInterest = Math.round(principal * rate);
  const monthlyDeduction = monthlyPrincipal + monthlyInterest;

  // default mock employers based on sector/profile for realism
  const employersBySector: Record<string, string> = {
    'Agriculture': 'Ministry of Agriculture',
    'Sustainable Energy': 'Electricity Supply Corporation of Malawi (ESCOM)',
    'Retail': 'Ministry of Trade & Industry',
    'Construction': 'Ministry of Transport & Public Works',
    'Personal': 'Malawi Civil Service',
    'Healthcare': 'Ministry of Health',
    'Transport': 'Ministry of Transport & Public Works',
    'Fisheries': 'Ministry of Forestry & Natural Resources',
    'Technology': 'Malawi Telecommunications Limited (MTL)',
    'Education': 'Ministry of Education',
    'Hospitality': 'Ministry of Tourism',
  };

  const employer = employersBySector[app.sector] || 'Government of Malawi';

  customerLoanMap.set(app.id, {
    appId: app.id,
    customerName: app.applicantName,
    employeeId: cust?.employeeNumber || `EMP-${app.id.replace(/\D/g, '')}`,
    nationalId: cust?.nationalId || 'NID-UNKNOWN',
    sector: app.sector,
    employer: employer,
    loanAmount: app.amount,
    monthlyDeduction: monthlyDeduction,
    status: app.status,
    riskLevel: app.riskLevel,
  });
}

console.log('Total loan applications:', seedLoanApplications.length);
console.log('Loan applications breakdown:');
for (const [id, item] of customerLoanMap.entries()) {
  console.log(`${item.employeeId} | ${item.customerName} | ${item.employer} | MWK ${item.monthlyDeduction.toLocaleString()} | Status: ${item.status}`);
}
