-- Initialize database with required extensions and settings
-- This file runs automatically when the PostgreSQL container is first created

-- Set timezone
SET timezone = 'UTC';

-- Grant privileges (redundant but ensures permissions)
GRANT ALL PRIVILEGES ON DATABASE social_messages TO social_messages;
