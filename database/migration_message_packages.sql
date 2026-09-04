USE cateraiDB;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS package_id INT DEFAULT NULL,
    ADD CONSTRAINT fk_messages_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL;