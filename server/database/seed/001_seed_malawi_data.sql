-- Malawian Domain Seed Data for PINACO Smart Advisor

INSERT INTO roles (id, name, description) VALUES
  ('admin', 'Administrator', 'Full system management and configuration permissions'),
  ('executive', 'Executive Manager', 'Read-only analytics and portfolio performance dashboards'),
  ('manager', 'Branch Manager', 'Credit approvals, officer assignments, and exception reviews'),
  ('officer', 'Loan Officer', 'Application origination, document verification, customer review'),
  ('customer', 'Borrower', 'Personal customer portal view')
ON CONFLICT (id) DO NOTHING;

INSERT INTO employers (id, name, sector, employee_count, risk_rating, successful_deduction_rate, failed_deduction_rate) VALUES
  ('emp-001', 'Ministry of Education', 'Education & Public Sector', 1200, 'Low', 98.50, 1.50),
  ('emp-002', 'Malawi Police Service', 'Civil Service & Security', 850, 'Low', 97.80, 2.20),
  ('emp-003', 'Illovo Sugar Malawi', 'Agriculture & Food Processing', 650, 'Medium', 94.20, 5.80),
  ('emp-004', 'Kukoma Oils Ltd', 'Manufacturing', 320, 'Medium', 91.50, 8.50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, password_hash, name, role, branch_id) VALUES
  ('lo-001', 'c.banda@pinnacle.mw', '$2b$12$eX8L/257lQ.K6tT7qN9a7u5YyW8s7nZ6r5q4p3o2n1m0', 'Chisomo Banda', 'officer', 'branch-lil'),
  ('lo-002', 'k.phiri@pinnacle.mw', '$2b$12$eX8L/257lQ.K6tT7qN9a7u5YyW8s7nZ6r5q4p3o2n1m0', 'Kondwani Phiri', 'officer', 'branch-lil'),
  ('lo-003', 's.mwale@pinnacle.mw', '$2b$12$eX8L/257lQ.K6tT7qN9a7u5YyW8s7nZ6r5q4p3o2n1m0', 'Stella Mwale', 'manager', 'branch-blt'),
  ('demo-customer-01', 's.chimwala@pmail.mw', '$2b$12$eX8L/257lQ.K6tT7qN9a7u5YyW8s7nZ6r5q4p3o2n1m0', 'Samuel Chimwala', 'customer', 'branch-lil')
ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, user_id, name, location, sector, employer_id, phone, email, employee_number, national_id, active_loans, status, risk_level, customer_type) VALUES
  ('cust-001', 'demo-customer-01', 'Samuel Chimwala', 'Lilongwe', 'Agriculture', 'emp-003', '+265 888 123 456', 's.chimwala@pmail.mw', 'EMP-8842', 'NID-9921-8842', 1, 'Active', 'Medium', 'Repeat Borrower')
ON CONFLICT (id) DO NOTHING;
