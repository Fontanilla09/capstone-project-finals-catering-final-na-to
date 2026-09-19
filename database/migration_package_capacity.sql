SET @column_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'packages' AND COLUMN_NAME = 'max_bookings');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE packages ADD COLUMN max_bookings INT NOT NULL DEFAULT 0 AFTER guest_count_max', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;