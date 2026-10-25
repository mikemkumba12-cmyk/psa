DELETE FROM loan_products
 WHERE id IN ('prd_payroll', 'prd_working_capital', 'prd_enterprise', 'prd_asset_finance', 'prd_order_finance', 'prd_invoice_discounting')
   AND status = 'draft'
   AND NOT EXISTS (SELECT 1 FROM loan_applications a WHERE a.product_id = loan_products.id);
UPDATE app_settings
   SET value = value - 'legalName' - 'supportEmail' - 'supportPhone' - 'tollFree' - 'whatsapp'
               - 'regulatoryStatement' - 'offices' - 'detailsSource'
 WHERE key = 'branding';
