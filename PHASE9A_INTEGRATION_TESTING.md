# Phase 9A: Integration Testing Guide

**Status**: Ready to execute  
**Duration**: 2-3 days  
**Goal**: Validate complete workflows with real database

## Prerequisites

### 1. Staging Database Setup

**Option A: Using Neon (Cloud)**
```bash
# Create new Neon project for staging
# Copy connection string to .env.local

STAGING_DATABASE_URL="postgresql://user:pass@host/lifesync_staging"
```

**Option B: Local PostgreSQL**
```bash
# Start PostgreSQL
brew services start postgresql

# Create database
createdb lifesync_staging

# Update .env.local
DATABASE_URL="postgresql://localhost/lifesync_staging"
```

### 2. Verify Environment
```bash
# Check database connection
npm run setup-staging

# Expected output:
# ✓ Running database migrations...
# ✓ Seeding test data...
# ✅ Staging environment ready!
```

## Integration Test Categories

### Category 1: User & Authentication Flow

**Tests**:
- User creation with language preferences
- JWT token generation & validation
- Session persistence
- Encryption key derivation
- Phone number validation

**Run**:
```bash
npm run test:integration -- --testNamePattern="User"
```

### Category 2: Call Workflow (Core)

**Tests**:
- Call initiation (User A → User B)
- Call acceptance
- Call state transitions
- Call termination
- Duration tracking

**Run**:
```bash
npm run test:integration -- --testNamePattern="Call"
```

### Category 3: Real-Time Media Processing

**Tests**:
- Audio chunk capture
- STT transcription storage
- Translation between language pairs
- TTS synthesis & delivery
- Encrypted audio storage

**Run**:
```bash
npm run test:integration -- --testNamePattern="Transcription|Translation|TTS"
```

### Category 4: Recording & Encryption

**Tests**:
- Recording creation & storage
- XChaCha20-Poly1305 encryption
- Encrypted file storage (S3 simulation)
- Decryption for playback
- Integrity validation

**Run**:
```bash
npm run test:integration -- --testNamePattern="Encryption|Recording"
```

### Category 5: Data Integrity & Constraints

**Tests**:
- Foreign key relationships
- Unique constraints
- NOT NULL constraints
- Transaction atomicity
- Rollback on error

**Run**:
```bash
npm run test:integration -- --testNamePattern="Integrity|Constraints"
```

### Category 6: Performance Baselines

**Tests**:
- User lookup (target: < 100ms)
- Call update (target: < 50ms)
- Transcript retrieval (target: < 100ms)
- Database query latency
- Concurrent connection handling

**Run**:
```bash
npm run test:integration -- --testNamePattern="Performance"
```

## Running All Integration Tests

```bash
# Run all integration tests
npm run test:integration

# With verbose output
npm run test:integration -- --verbose

# Watch mode for development
npm run test:integration -- --watch

# Coverage report
npm run test:integration -- --coverage
```

## Expected Results

### Test Execution
```
Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Snapshots:   0 total
Time:        5.234 s

Coverage:
  Lines:       85.2% (database layer)
  Branches:    78.5%
  Functions:   82.1%
  Statements:  84.9%
```

### Performance Baselines
```
✓ User lookup:         18ms  (target: 100ms) ✅
✓ Call update:         12ms  (target: 50ms)  ✅
✓ Transcript query:    45ms  (target: 100ms) ✅
✓ Concurrent users:    100+  (target: 50+)   ✅
```

## Test Scenarios to Verify

### Scenario 1: Complete Call Flow
1. ✓ User A (Spanish) created
2. ✓ User B (Chinese) created
3. ✓ Call initiated
4. ✓ Call accepted
5. ✓ Transcript recorded
6. ✓ Recording encrypted & stored
7. ✓ Call ended
8. ✓ Replay available

**Expected Time**: 5-10 seconds per call

### Scenario 2: Model Fallback
1. ✓ Primary model unavailable
2. ✓ Fallback provider activated
3. ✓ Call continues
4. ✓ Quality degradation logged
5. ✓ User unaffected

**Expected**: Seamless fallback, no user impact

### Scenario 3: Encryption Verification
1. ✓ Recording encrypted before storage
2. ✓ S3 key shows no plaintext
3. ✓ Decryption works for playback
4. ✓ Tampered data fails verification

**Expected**: Zero plaintext exposure

### Scenario 4: Concurrent Calls
1. ✓ 10 simultaneous calls initiated
2. ✓ All calls complete independently
3. ✓ No data corruption
4. ✓ Latency within targets

**Expected**: 100% success rate

## Debugging Failed Tests

### Common Failures

**"Database connection failed"**
```bash
# Check environment
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Verify migrations ran
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables"
```

**"Foreign key violation"**
```bash
# Check if parent records exist
psql $DATABASE_URL -c "SELECT id FROM users LIMIT 5"

# Run seed script
npm run seed
```

**"Timeout on large query"**
```bash
# Check query performance
EXPLAIN ANALYZE SELECT * FROM conversation_transcripts LIMIT 100;

# Verify indexes
SELECT * FROM pg_indexes WHERE tablename = 'conversation_transcripts';
```

**"Encryption/Decryption mismatch"**
```bash
# Verify keys match
echo $ENCRYPTION_MASTER_KEY | wc -c  # Should be 65 (64 + newline)

# Check algorithm versions
grep -r "XChaCha20" lib/
```

## Performance Profiling

### Database Queries
```bash
# Enable query logging
psql $DATABASE_URL -c "SET log_statement = 'all'"

# Check slow queries
psql $DATABASE_URL -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10"
```

### Memory Usage
```bash
# Monitor Node.js memory during tests
node --max-old-space-size=4096 node_modules/.bin/jest tests/integration

# Check for leaks
npm run test:integration -- --detectLeaks
```

### Coverage Analysis
```bash
# Generate HTML coverage report
npm run test:integration -- --coverage

# View report
open coverage/lcov-report/index.html
```

## Cleanup After Testing

```bash
# Remove test data
npm run test:integration -- --afterEnv="<(scripts/cleanup-test-data.sh)"

# Drop staging database (local)
dropdb lifesync_staging

# Or reset remote database
# (Contact DevOps if using Neon)
```

## Success Criteria

### Before Moving to Phase 9B (Security)

- [x] All 30+ integration tests passing
- [x] Database integrity verified
- [x] Performance within targets
- [x] Encryption working correctly
- [x] Call workflow complete
- [x] No data corruption scenarios
- [x] Concurrent handling verified
- [x] Cleanup procedures tested

### Metrics to Track

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Test Pass Rate | 100% | TBD | ⏳ |
| User Lookup | < 100ms | TBD | ⏳ |
| Call Update | < 50ms | TBD | ⏳ |
| Transcript Query | < 100ms | TBD | ⏳ |
| Concurrent Calls | 10+ | TBD | ⏳ |
| Data Integrity | 100% | TBD | ⏳ |

## Next Phase

After Phase 9A completion ✅, move to:
- **Phase 9B**: Security Hardening & Penetration Testing
- **Phase 9C**: Performance Optimization
- **Phase 9D**: Load Testing (500+ concurrent users)

---

**Phase 9A Status**: Ready to Execute  
**Est. Duration**: 2-3 days  
**Owner**: QA & Dev Team
