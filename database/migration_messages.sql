USE cateraiDB;

ALTER TABLE messages
    MODIFY COLUMN reservation_id INT DEFAULT NULL;