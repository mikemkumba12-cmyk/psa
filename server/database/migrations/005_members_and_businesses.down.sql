DROP TABLE IF EXISTS business_financials;
DROP TABLE IF EXISTS business_parties;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_business_fkey;
DROP TABLE IF EXISTS businesses;
DROP TABLE IF EXISTS members;
