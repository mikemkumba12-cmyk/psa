-- Migration 007: Pinnacle's public product catalogue as DRAFT products, and public contact details.
--
-- Source: https://pinnacle.co.mw/products (reviewed 2026-10-25). The site publishes amount ranges and
-- tenures but no interest rates, fees or eligibility rules. Every product is therefore created as a
-- draft with terms_confirmed = FALSE and no rate. The database refuses to activate a product without a
-- rate, and the API also requires an administrator to confirm the terms before activation.

INSERT INTO loan_products (id, code, name, category, borrower_type, description, min_amount, max_amount,
                           min_term_months, max_term_months, interest_method, repayment_frequency,
                           required_documents, members_only, collateral_required, collateral_notes, status, eligibility)
VALUES
  ('prd_payroll', 'PAYROLL', 'Payroll Loan', 'payroll', 'individual',
   'Loans for salaried employees in the public and private sectors, repaid through payroll deduction.',
   50000, 5000000, 3, 72, 'reducing_balance', 'monthly',
   ARRAY['national_id_front', 'national_id_back', 'payslip'], FALSE, FALSE, NULL, 'draft',
   '{"source": "pinnacle.co.mw/products (published range only)"}'::jsonb),

  ('prd_working_capital', 'WORKING_CAPITAL', 'Working Capital Loan', 'working_capital', 'business',
   'Finance for day-to-day business operations such as stock, wages and supplier payments.',
   3000000, 100000000, 6, 12, 'reducing_balance', 'monthly',
   ARRAY['business_registration', 'tax_clearance', 'bank_statement'], TRUE, FALSE,
   'Security documents where applicable (to be confirmed by credit policy).', 'draft',
   '{"source": "pinnacle.co.mw/products/working-capital (published range only)"}'::jsonb),

  ('prd_enterprise', 'ENTERPRISE', 'Enterprise Loan', 'enterprise', 'business',
   'Finance for the operational needs of established enterprises.',
   3000000, 20000000, 6, 18, 'reducing_balance', 'monthly',
   ARRAY['business_registration', 'tax_clearance', 'bank_statement', 'financial_statements'], TRUE, FALSE,
   'Security documents where applicable (to be confirmed by credit policy).', 'draft',
   '{"source": "pinnacle.co.mw/products/enterprise-loans (published range only)"}'::jsonb),

  ('prd_asset_finance', 'ASSET_FINANCE', 'Asset Financing', 'asset_financing', 'business',
   'Finance to acquire productive business assets such as vehicles and machinery.',
   3000000, 100000000, 6, 24, 'reducing_balance', 'monthly',
   ARRAY['business_registration', 'tax_clearance', 'bank_statement', 'asset_quotation'], TRUE, TRUE,
   'The financed asset is expected to serve as security (to be confirmed by credit policy).', 'draft',
   '{"source": "pinnacle.co.mw/products (published range only)"}'::jsonb),

  ('prd_order_finance', 'ORDER_FINANCE', 'Order Financing', 'order_financing', 'business',
   'Finance to fulfil confirmed customer orders or contracts.',
   4000000, 100000000, 1, 6, 'flat', 'bullet',
   ARRAY['business_registration', 'tax_clearance', 'bank_statement', 'purchase_order'], TRUE, FALSE,
   'Security documents where applicable (to be confirmed by credit policy).', 'draft',
   '{"source": "pinnacle.co.mw/products (published range only)"}'::jsonb),

  ('prd_invoice_discounting', 'INVOICE_DISCOUNTING', 'Invoice Discounting', 'invoice_discounting', 'business',
   'Advances against confirmed, unpaid invoices to ease working capital.',
   NULL, NULL, 1, 6, 'flat', 'bullet',
   ARRAY['business_registration', 'tax_clearance', 'bank_statement', 'invoice'], TRUE, FALSE,
   'Confirmed invoices; advance amount depends on invoice value (to be confirmed by credit policy).', 'draft',
   '{"source": "pinnacle.co.mw/products/invoice-discounting (no amount range published)"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Public contact details from pinnacle.co.mw (footer, reviewed 2026-10-25).
UPDATE app_settings
   SET value = value || '{
         "legalName": "Pinnacle Financial Services Limited",
         "supportEmail": "info@pinnacle.co.mw",
         "supportPhone": "+265 990 672 924",
         "tollFree": "4301",
         "whatsapp": "+265 990 672 924",
         "regulatoryStatement": "Licensed by the Reserve Bank of Malawi (NDMFI 014/19)",
         "offices": [
           {"city": "Lilongwe", "address": "SS Singh Trust Building, Plot No. 40/14, City Centre"},
           {"city": "Lilongwe", "address": "Bestway Building, Area 3"},
           {"city": "Blantyre", "address": "Avalon Office Park, 1st Floor, Masauko Chipembere Highway"},
           {"city": "Mzuzu", "address": "Hope Square Building, 3rd Floor"}
         ],
         "detailsSource": "pinnacle.co.mw (public website)"
       }'::jsonb,
       updated_at = now()
 WHERE key = 'branding';
