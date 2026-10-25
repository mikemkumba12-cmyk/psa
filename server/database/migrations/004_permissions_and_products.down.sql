DROP TABLE IF EXISTS user_product_access;
DROP TABLE IF EXISTS loan_products;
DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS role_permissions;
DELETE FROM permissions;
ALTER TABLE permissions DROP COLUMN IF EXISTS description, DROP COLUMN IF EXISTS sort_order;
