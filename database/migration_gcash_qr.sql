USE cateraiDB;

ALTER TABLE caterers
    ADD COLUMN IF NOT EXISTS gcash_qr_code VARCHAR(255) DEFAULT NULL;

ALTER TABLE payments
    MODIFY COLUMN payment_method ENUM('e-wallet', 'cash', 'card', 'paypal', 'gcash') NOT NULL;