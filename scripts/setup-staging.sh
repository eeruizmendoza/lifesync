#!/bin/bash
# Setup staging environment for Phase 9 testing

set -e

echo "🚀 Setting up LifeSync Staging Environment"
echo "=========================================="

# Check prerequisites
echo "✓ Checking prerequisites..."

if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Install PostgreSQL client."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found."
    exit 1
fi

# Load environment
echo "✓ Loading environment..."
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found. Create it with staging database URL."
    exit 1
fi

# Create staging database if using local PostgreSQL
if [[ "$DATABASE_URL" == *"localhost"* ]]; then
    echo "✓ Creating local staging database..."
    createdb lifesync_staging 2>/dev/null || echo "  (Database may already exist)"
fi

# Run migrations
echo "✓ Running database migrations..."
npm run migrate 2>&1 | grep -E "(Migration|Applied|Error|✓)" || true

# Seed test data
echo "✓ Seeding test data..."
psql "$DATABASE_URL" << EOSQL
  -- Insert test users
  INSERT INTO users (id, email, phone, language_preference, created_at)
  VALUES
    ('test-spanish-speaker', 'spanish@test.com', '+15555551111', 'es', NOW()),
    ('test-chinese-speaker', 'chinese@test.com', '+15555552222', 'zh', NOW())
  ON CONFLICT DO NOTHING;

  -- Insert model configurations
  INSERT INTO model_config (model_type, active_model, fallback_model, enabled)
  VALUES
    ('stt', 'whisper-v3', 'deepgram-nova-2', true),
    ('translation', 'deepl-v3', 'seamless-m4t', true),
    ('tts', 'elevenlabs-v3', 'piper', true)
  ON CONFLICT DO NOTHING;

  -- Insert model costs
  INSERT INTO model_costs (model_name, provider, model_type, cost_per_minute, effective_date)
  VALUES
    ('whisper-v3', 'openai', 'stt', 0.003, NOW()::DATE),
    ('deepl-v3', 'deepl', 'translation', NULL, NOW()::DATE),
    ('elevenlabs-v3', 'elevenlabs', 'tts', 0.30, NOW()::DATE)
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) as users_created FROM users;
EOSQL

echo ""
echo "✅ Staging environment ready!"
echo ""
echo "Next steps:"
echo "1. Run tests: npm test"
echo "2. Run integration tests: npm run test:integration"
echo "3. Monitor health: curl http://localhost:3000/api/health"
echo ""
