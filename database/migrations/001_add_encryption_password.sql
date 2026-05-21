/**
 * Migration 001: Add encryption password fields to users table
 * Enables user-controlled encryption keys derived from their passwords
 */

-- Add encryption-related columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_key_salt VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_key_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_enabled BOOLEAN DEFAULT false;

-- Create index for faster lookups on encryption_enabled
CREATE INDEX IF NOT EXISTS idx_users_encryption_enabled ON users(encryption_enabled);

-- Add comment documenting the encryption approach
COMMENT ON COLUMN users.encryption_password_hash IS 'Bcrypt hash of user-provided encryption password (NOT login password)';
COMMENT ON COLUMN users.encryption_key_salt IS 'Base64-encoded salt used in PBKDF2 key derivation';
COMMENT ON COLUMN users.encryption_key_encrypted IS 'User''s derived encryption key encrypted with master key (AES-256-GCM)';
COMMENT ON COLUMN users.encryption_enabled IS 'Whether user has set up password-based encryption';
