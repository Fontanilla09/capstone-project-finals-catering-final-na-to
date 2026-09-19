USE cateraiDB;

CREATE TABLE IF NOT EXISTS admin_activity_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_user_id INT NOT NULL,
    action VARCHAR(80) NOT NULL,
    details VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);