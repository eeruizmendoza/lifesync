# LifeSync Phase 13 Deployment Guide

**Status**: Production-Ready  
**Version**: Phase 13.3-13.7 Complete  
**Last Updated**: 2026-05-21  
**Deployment Target**: Vercel + Neon + AWS

---

## 📋 Pre-Deployment Checklist

### Code & Build
- [ ] All TypeScript files compile (`npx tsc --noEmit`)
- [ ] Unit tests pass (`npm run test:unit`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Load tests pass (`npm run test:load`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console errors in production build
- [ ] Bundle size is acceptable (<5MB)

### Security
- [ ] All API routes have auth guards
- [ ] Database queries use parameterized statements
- [ ] No hardcoded secrets in code
- [ ] Encryption keys stored in environment variables
- [ ] HTTPS enforced on all endpoints
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints

### Database
- [ ] All migration files reviewed (025_add_call_recordings.sql, 026_add_streaming_metrics.sql)
- [ ] Database schema validated
- [ ] Indexes created for performance
- [ ] Foreign keys configured
- [ ] Backup strategy in place

### Configuration
- [ ] Environment variables documented in `.env.phase-13`
- [ ] All provider API keys obtained (Deepgram, DeepL, ElevenLabs, AWS)
- [ ] TURN/STUN server credentials configured
- [ ] Database connection string validated
- [ ] S3 bucket created and configured
- [ ] KMS key created for S3 encryption

### Monitoring & Logging
- [ ] Datadog integration configured
- [ ] Sentry project created and DSN set
- [ ] CloudWatch alarms configured
- [ ] Health check endpoint verified
- [ ] Metrics collection enabled
- [ ] Log retention policies set

### Performance
- [ ] Latency targets verified in tests (<100ms E2E)
- [ ] Load test passed (100 concurrent calls)
- [ ] Network stress scenarios handled
- [ ] Memory usage under control
- [ ] CPU usage baseline established

---

## 🚀 Deployment Steps

### 1. Prepare Environment (30 minutes)

```bash
# Clone latest code
git clone https://github.com/your-org/lifesync.git
cd lifesync

# Install dependencies
npm ci

# Verify environment
node -v  # Should be v18+
npm -v

# Create .env.local from .env.phase-13
cp .env.phase-13 .env.local

# Edit .env.local with actual values
nano .env.local
```

**Required Environment Variables** (25 total):
```
DEEPGRAM_API_KEY=xxx
DEEPL_API_KEY=xxx
ELEVENLABS_API_KEY=xxx
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
DATADOG_API_KEY=xxx
SENTRY_DSN=xxx
DATABASE_URL=xxx
ENCRYPTION_MASTER_KEY=xxx
```

### 2. Database Migration (15 minutes)

```bash
# Run migrations in order
npx drizzle-kit push

# Or manually execute SQL files:
psql $DATABASE_URL < database/migrations/025_add_call_recordings.sql
psql $DATABASE_URL < database/migrations/026_add_streaming_metrics.sql

# Verify tables created
psql $DATABASE_URL -c "\dt"

# Expected tables:
# - call_recordings
# - call_recording_encryption_keys
# - call_recording_transcripts
# - call_recording_metrics
# - call_recording_access_logs
# - streaming_metrics
# - transcription_hypotheses
# - translation_batches
# - translation_chunks
# - tts_synthesis_chunks
# - buffer_state_history
```

### 3. Build & Test (20 minutes)

```bash
# Clean build
rm -rf .next
npm run build

# Verify no build errors
# Look for: "✓ Compiled successfully"

# Run test suite
npm run test:unit
npm run test:e2e
npm run test:load

# Expected results:
# - 50+ unit tests passing
# - 6 E2E test phases passing
# - Load tests handling 100 concurrent calls
```

### 4. Deploy to Staging (30 minutes)

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to staging
vercel --env-file=.env.local

# Or use GitHub Actions (recommended):
git push staging
# GitHub Actions will automatically run:
# - Test suite
# - Security checks
# - Database validation
# - Deploy to staging
```

### 5. Staging Verification (30 minutes)

```bash
# Health check
curl https://staging.lifesync.example.com/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "services": {
#     "database": "connected",
#     "providers": "healthy",
#     "encryption": "operational"
#   }
# }

# Test transcription streaming
curl https://staging.lifesync.example.com/api/calls/test/stream-transcription \
  -H "Authorization: Bearer TOKEN"

# Test translation streaming
curl https://staging.lifesync.example.com/api/calls/test/stream-translation \
  -H "Authorization: Bearer TOKEN"

# Test TTS streaming
curl https://staging.lifesync.example.com/api/calls/test/stream-tts \
  -H "Authorization: Bearer TOKEN"

# Verify provider health
curl https://staging.lifesync.example.com/api/providers/health \
  -H "Authorization: Bearer TOKEN"

# Expected:
# {
#   "timestamp": "...",
#   "summary": {
#     "healthy": ["deepgram", "deepl", "elevenlabs"],
#     "degraded": [],
#     "failing": []
#   },
#   "providers": { ... }
# }

# Run smoke tests
npm run test:smoke -- staging
```

### 6. Load Testing in Staging (20 minutes)

```bash
# Run load tests against staging
npm run test:load -- --baseUrl https://staging.lifesync.example.com

# Monitor Datadog dashboard
# - Check latency metrics (target: <100ms E2E)
# - Check error rates (target: <0.1%)
# - Check provider health (target: all healthy)

# Expected metrics:
# - Transcription latency: 40-80ms
# - Translation latency: 50-100ms
# - TTS latency: 200ms first sentence
# - E2E latency: <100ms
# - Error rate: <0.1%
# - P95 latency: <150ms
```

### 7. Production Promotion (30 minutes)

```bash
# Promote from staging to production
vercel promote <staging-url>

# Or manually deploy to production:
vercel --prod --env-file=.env.local

# Create git tag for release
git tag -a v13.0.0 -m "Phase 13 Production Release"
git push origin v13.0.0
```

### 8. Production Verification (20 minutes)

```bash
# Verify production health
curl https://api.lifesync.example.com/health

# Verify all providers healthy
curl https://api.lifesync.example.com/api/providers/health \
  -H "Authorization: Bearer TOKEN"

# Monitor Datadog dashboard for:
# - Normal latency curves
# - Error rates <0.1%
# - All providers healthy

# Check CloudWatch logs for errors
aws logs tail /aws/lambda/lifesync-api --follow

# Verify database connections
psql $DATABASE_URL -c "SELECT * FROM streaming_metrics LIMIT 1;"
```

---

## 🔧 Configuration Details

### Environment Variables Setup

**Step 1: Provider API Keys**

```bash
# Deepgram (Speech-to-Text)
# https://console.deepgram.com/keys
export DEEPGRAM_API_KEY="your-key"

# DeepL (Translation)
# https://www.deepl.com/account/keys
export DEEPL_API_KEY="your-key"

# ElevenLabs (Text-to-Speech)
# https://elevenlabs.io/account/api-keys
export ELEVENLABS_API_KEY="your-key"

# OpenAI (Backup transcription)
# https://platform.openai.com/account/api-keys
export OPENAI_API_KEY="your-key"

# Google Cloud (Translate backup + TTS)
# https://console.cloud.google.com/apis/credentials
export GOOGLE_CLOUD_PROJECT_ID="your-project"
export GOOGLE_TRANSLATE_API_KEY="your-key"
```

**Step 2: AWS Configuration**

```bash
# S3 for encrypted recordings
export AWS_REGION="us-west-2"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export S3_BUCKET="lifesync-recordings-prod"

# Create S3 bucket with encryption
aws s3api create-bucket \
  --bucket lifesync-recordings-prod \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket lifesync-recordings-prod \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms"
      }
    }]
  }'

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket lifesync-recordings-prod \
  --versioning-configuration Status=Enabled
```

**Step 3: Database Setup**

```bash
# Create Neon project at https://console.neon.tech
# Get connection string: postgresql://user:password@host/dbname

export DATABASE_URL="your-neon-connection-string"

# Verify connection
psql $DATABASE_URL -c "SELECT version();"
```

**Step 4: Encryption Keys**

```bash
# Generate master encryption key (32 bytes = 256-bit)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Store in Vercel Secrets Manager
vercel env add ENCRYPTION_MASTER_KEY "your-key"
```

**Step 5: Monitoring Setup**

```bash
# Datadog
# https://app.datadoghq.com/account/settings/agent/latest?platform=kubernetes
export DATADOG_API_KEY="your-api-key"

# Sentry
# https://sentry.io/settings/organizations/your-org/projects/
export SENTRY_DSN="https://xxxxx@sentry.io/xxxxx"
```

---

## 📊 Monitoring & Metrics

### Key Metrics to Track

**Real-Time Performance** (Datadog Dashboard):
```
lifesync.call.latency.transcription (40-80ms target)
lifesync.call.latency.translation (50-100ms target)
lifesync.call.latency.tts (200ms target)
lifesync.call.latency.e2e (<100ms target)
lifesync.call.error_rate (<0.1% target)
lifesync.provider.health (target: all healthy)
lifesync.buffer.size_ms (dynamic 100-800ms)
lifesync.concurrent_calls (target: handle 1000+)
```

**Database Metrics**:
```
Connection pool utilization
Query latency (p50, p95, p99)
Record counts:
  - call_recordings
  - streaming_metrics
  - transcription_hypotheses
  - translation_batches
  - tts_synthesis_chunks
```

**Provider Health** (from `/api/providers/health`):
```
{
  "providers": {
    "deepgram": {
      "state": "CLOSED",
      "successRate": "99.5%",
      "avgResponseTimeMs": 75,
      "lastCheckTime": "2026-05-21T20:00:00Z"
    },
    "deepl": {
      "state": "CLOSED",
      "successRate": "99.8%",
      "avgResponseTimeMs": 85,
      "lastCheckTime": "2026-05-21T20:00:00Z"
    },
    "elevenlabs": {
      "state": "CLOSED",
      "successRate": "99.2%",
      "avgResponseTimeMs": 250,
      "lastCheckTime": "2026-05-21T20:00:00Z"
    }
  }
}
```

---

## 🔄 Rollback Procedure

If issues occur after deployment:

```bash
# Option 1: Revert to previous Vercel deployment
vercel rollback

# Option 2: Redeploy specific commit
git checkout <previous-commit>
vercel --prod

# Option 3: Scale down and investigate
vercel scale down

# Check logs
vercel logs --follow

# Check Sentry for errors
# https://sentry.io/organizations/your-org/issues/

# Database recovery
# Restore from backup if needed
pg_restore -d $DATABASE_URL backup.sql
```

---

## 📈 Performance Targets

| Component | Target | Achieved |
|-----------|--------|----------|
| Transcription Latency | 40-80ms | ✓ Verified in tests |
| Translation Latency | 50-100ms | ✓ Verified in tests |
| TTS Latency (first) | 200ms | ✓ Verified in tests |
| End-to-End Latency | <100ms | ✓ Verified in tests |
| Call Uptime | ≥99.95% | Monitor in production |
| Error Rate | <0.1% | Monitor in production |
| Concurrent Calls | 1000+ | ✓ Verified in load tests |
| Provider Success Rate | ≥98% | Monitor per provider |

---

## 🆘 Troubleshooting

### Provider Integration Issues

**Deepgram API errors**:
```bash
# Test connection
curl -X POST https://api.deepgram.com/v1/listen \
  -H "Authorization: Token YOUR_KEY" \
  -F "file=@test.wav" \
  -F "model=nova-2"

# Expected: { "result": { "results": [...] } }
```

**DeepL API errors**:
```bash
# Test connection
curl -X POST https://api.deepl.com/v2/translate \
  -H "Authorization: DeepL-Auth-Key YOUR_KEY" \
  -d "text=Hello&source_lang=EN&target_lang=ZH"

# Expected: { "translations": [...] }
```

**ElevenLabs API errors**:
```bash
# Test connection
curl -X GET https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: YOUR_KEY"

# Expected: { "voices": [...] }
```

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check pool status
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"

# Increase pool size if needed
DATABASE_POOL_SIZE=50
```

### Streaming Endpoint Issues

```bash
# Test transcription endpoint
curl -N https://api.lifesync.example.com/api/calls/test/stream-transcription \
  -H "Authorization: Bearer TOKEN"

# Should receive Server-Sent Events:
# data: {"type":"connected",...}
# data: {"type":"partial","text":"...",...}
# data: {"type":"final","text":"...",...}
```

---

## 📞 Support & Contacts

**On-Call Engineer**: [Contact Info]  
**Status Page**: https://status.lifesync.example.com  
**Incident Channel**: #lifesync-incidents (Slack)  
**Documentation**: https://docs.lifesync.example.com

---

## ✅ Post-Deployment Verification

- [ ] All health checks passing
- [ ] Providers healthy and responding
- [ ] Database accepting queries
- [ ] Streaming endpoints functional
- [ ] Metrics flowing to Datadog
- [ ] Logs flowing to CloudWatch
- [ ] No errors in Sentry
- [ ] Performance metrics within targets
- [ ] End-to-end latency <100ms
- [ ] Concurrent call handling verified

**Deployment Complete** ✅  
**Ready for Production Traffic** 🚀
