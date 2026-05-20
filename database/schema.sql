/**
 * LifeSync Database Schema
 * End-to-end encrypted social network + communications aggregator
 */

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  private BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email);

-- SMS Verification (temporary storage)
CREATE TABLE IF NOT EXISTS sms_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  code VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sms_phone ON sms_verification(phone_number);
CREATE INDEX idx_sms_expires ON sms_verification(expires_at);

-- Contacts (phone contact mapping - local on device, but stored for connection suggestions)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  phone_number VARCHAR(20),
  email VARCHAR(255),
  name VARCHAR(255),
  hash_key VARCHAR(255), -- Hash for privacy
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_contacts_contact_user ON contacts(contact_user_id);

-- Connection Requests (invites)
CREATE TABLE IF NOT EXISTS connection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conn_req_from ON connection_requests(from_user_id);
CREATE INDEX idx_conn_req_to ON connection_requests(to_user_id);
CREATE INDEX idx_conn_req_status ON connection_requests(status);

-- Connections (accepted relationships)
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id_1, user_id_2)
);

CREATE INDEX idx_conn_user1 ON connections(user_id_1);
CREATE INDEX idx_conn_user2 ON connections(user_id_2);

-- Social Posts (encrypted)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
  content_type VARCHAR(50) DEFAULT 'text', -- text, photo, video
  post_type VARCHAR(50) DEFAULT 'feed', -- feed, story, reel
  media_urls TEXT[], -- Array of photo/video URLs
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_deleted ON posts(deleted_at);

-- Post Likes
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_likes_post ON post_likes(post_id);
CREATE INDEX idx_likes_user ON post_likes(user_id);

-- Post Comments (encrypted)
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_comments_post ON post_comments(post_id);
CREATE INDEX idx_comments_user ON post_comments(user_id);

-- Post Reactions
CREATE TABLE IF NOT EXISTS post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(10) NOT NULL, -- 😂, ❤️, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id, emoji)
);

CREATE INDEX idx_reactions_post ON post_reactions(post_id);
CREATE INDEX idx_reactions_user ON post_reactions(user_id);

-- Source Connections (OAuth tokens for integrations)
CREATE TABLE IF NOT EXISTS source_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL, -- gmail, sms, whatsapp, etc.
  oauth_token_encrypted TEXT, -- AES-256-GCM encrypted
  oauth_refresh_token_encrypted TEXT, -- AES-256-GCM encrypted
  last_sync_at TIMESTAMP,
  sync_status VARCHAR(50) DEFAULT 'idle', -- idle, syncing, error
  sync_error TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_source_user ON source_connections(user_id);
CREATE INDEX idx_source_type ON source_connections(source_type);

-- Unified Messages (aggregated communications)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL, -- gmail, sms, whatsapp, call, voicemail
  source_id VARCHAR(500) NOT NULL, -- Original ID from source
  from_contact_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted email/phone
  to_contacts_encrypted TEXT, -- AES-256-GCM encrypted array of recipients
  subject_encrypted TEXT, -- AES-256-GCM encrypted
  body_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
  message_type VARCHAR(50), -- email, sms, call, voicemail, group_chat
  duration_seconds INT, -- For calls
  transcription_encrypted TEXT, -- AES-256-GCM encrypted (for voicemails)
  thread_id VARCHAR(500), -- For grouping conversations
  attachment_ids TEXT[], -- References to files table
  created_at TIMESTAMP NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_source ON messages(source_type);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_deleted ON messages(deleted_at);

-- Files & Attachments
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100), -- image/jpeg, application/pdf, etc.
  file_size INT,
  s3_url TEXT NOT NULL, -- Encrypted storage URL
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_files_user ON files(user_id);
CREATE INDEX idx_files_message ON files(message_id);

-- Photos (from messages and device backups)
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  source_type VARCHAR(50), -- gmail, sms, iphone_backup, etc.
  s3_url TEXT NOT NULL,
  thumbnail_url TEXT,
  metadata_encrypted TEXT, -- AES-256-GCM encrypted (EXIF, etc.)
  taken_at TIMESTAMP,
  uploaded_to_app_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_photos_user ON photos(user_id);
CREATE INDEX idx_photos_message ON photos(message_id);
CREATE INDEX idx_photos_taken ON photos(taken_at DESC);

-- Calls & Voicemails
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_phone_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
  contact_name_encrypted TEXT, -- AES-256-GCM encrypted
  call_type VARCHAR(50), -- inbound, outbound, missed, voicemail
  duration_seconds INT,
  transcription_encrypted TEXT, -- AES-256-GCM encrypted (for voicemails)
  audio_url TEXT, -- S3 URL (encrypted filename)
  called_at TIMESTAMP NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_calls_user ON calls(user_id);
CREATE INDEX idx_calls_type ON calls(call_type);
CREATE INDEX idx_calls_date ON calls(called_at DESC);

-- Search Index (for full-text search across encrypted data)
CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_hash VARCHAR(255) NOT NULL, -- Hash of decrypted content for search
  source_type VARCHAR(50), -- messages, posts, files, etc.
  source_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_search_user ON search_index(user_id);
CREATE INDEX idx_search_hash ON search_index(content_hash);

-- Audit Log (for security & privacy)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
