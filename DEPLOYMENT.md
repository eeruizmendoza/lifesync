# LifeSync Deployment Guide

## Overview

LifeSync is a world-class real-time translation communication platform. This guide covers deployment to production environments.

## Architecture

```
┌─────────────────────────────────────────┐
│     Vercel (Edge Network)               │
│  - Next.js Application                  │
│  - API Routes                           │
│  - Static Assets                        │
└────────────┬────────────────────────────┘
             │
     ┌───────┴────────┐
     │                │
┌────▼─────┐    ┌────▼──────────┐
│  Neon    │    │  AWS S3        │
│PostgreSQL│    │  (Recordings)  │
└──────────┘    └────────────────┘
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local development)
- Vercel account (for production deployment)
- AWS account (for S3 storage)
- Neon PostgreSQL database
- API keys for:
  - OpenAI Whisper
  - DeepL Translation
  - ElevenLabs TTS
  - Twilio (SMS)

## Local Development

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# Run migrations
docker-compose exec web npm run migrate

# Access the application
open http://localhost:3000

# Stop services
docker-compose down
```

## Production Deployment

### CI/CD Pipeline

All deployments go through:
1. **Test**: Unit & security tests
2. **Build**: Next.js production build
3. **Deploy Staging**: Preview environment
4. **Deploy Production**: Canary (5%) → Full (100%)
5. **Monitor**: Metrics & alerts

### Deployment Status

- **Test**: `npm run test` ✅
- **Build**: `npm run build` ✅
- **CI/CD**: `.github/workflows/` ✅

### Research Pipeline

Runs daily at 2 AM UTC:
- Benchmarks new model versions
- Auto-switches on >2% improvement
- Creates GitHub PRs for upgrades

## Key Features Completed

- ✅ Phase 1-6: Core platform built
- ✅ Phase 7: Testing infrastructure (54/56 unit tests passing)
- ✅ Phase 8: Deployment configuration

## Next Steps

1. Deploy to staging: `vercel deploy`
2. Run production tests
3. Configure monitoring & alerts
4. Launch to users

For full deployment details, see individual workflow files in `.github/workflows/`
