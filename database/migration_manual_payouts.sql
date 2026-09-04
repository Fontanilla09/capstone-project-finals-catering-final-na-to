USE cateraiDB;

ALTER TABLE caterers
    ADD COLUMN IF NOT EXISTS paypal_email VARCHAR(150) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS payouts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reservation_id INT NOT NULL UNIQUE,
    caterer_id INT NOT NULL,
    payment_id INT DEFAULT NULL,
    gross_amount DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    caterer_amount DECIMAL(10, 2) NOT NULL,
    payout_status ENUM('pending', 'processing', 'paid', 'failed') NOT NULL DEFAULT 'pending',
    payout_reference VARCHAR(100) DEFAULT NULL,
    payout_batch_id VARCHAR(100) DEFAULT NULL,
    payout_item_id VARCHAR(100) DEFAULT NULL,
    payout_error TEXT DEFAULT NULL,
    paid_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (caterer_id) REFERENCES caterers(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payout_caterer_status ON payouts(caterer_id, payout_status);

ALTER TABLE payouts
    MODIFY COLUMN payout_status ENUM('pending', 'processing', 'paid', 'failed') NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS payout_batch_id VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS payout_item_id VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS payout_error TEXT DEFAULT NULL;
