USE cateraiDB;

ALTER TABLE payments
    MODIFY COLUMN payment_method ENUM('e-wallet', 'cash', 'card', 'paypal') NOT NULL,
    ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30) DEFAULT 'down_payment',
    ADD COLUMN IF NOT EXISTS payer_email VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS payer_name VARCHAR(150) DEFAULT NULL;
