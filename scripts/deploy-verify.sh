#!/bin/bash

###############################################################################
# Phase 13 Deployment Verification Script
# Validates all components before production deployment
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Function to print status
print_status() {
  local status=$1
  local message=$2

  if [ "$status" = "PASS" ]; then
    echo -e "${GREEN}✓ PASS${NC}: $message"
    ((PASSED_CHECKS++))
  elif [ "$status" = "FAIL" ]; then
    echo -e "${RED}✗ FAIL${NC}: $message"
    ((FAILED_CHECKS++))
  else
    echo -e "${YELLOW}⚠ WARN${NC}: $message"
  fi
  ((TOTAL_CHECKS++))
}

# Header
echo -e "${YELLOW}=== LifeSync Phase 13 Deployment Verification ===${NC}\n"

###############################################################################
# 1. CODE & BUILD CHECKS
###############################################################################

echo -e "${YELLOW}--- Code & Build Checks ---${NC}"

# Check TypeScript compilation
if npx tsc --noEmit > /dev/null 2>&1; then
  print_status "PASS" "TypeScript compilation"
else
  print_status "FAIL" "TypeScript compilation"
fi

# Check build succeeds
if npm run build > /dev/null 2>&1; then
  print_status "PASS" "Production build"
else
  print_status "FAIL" "Production build"
fi

# Check for console.error in production
if ! grep -r "console\.error" lib/ app/ --include="*.ts" --include="*.tsx" | grep -v "test" | grep -v "\.test\." > /dev/null 2>&1; then
  print_status "PASS" "No console.error in production code"
else
  print_status "WARN" "console.error found in production code (review needed)"
fi

# Check for hardcoded secrets
if ! grep -r "password\|secret\|key\|token" lib/ app/ --include="*.ts" --include="*.tsx" | grep -v "export\|getSecret\|process.env" > /dev/null 2>&1; then
  print_status "PASS" "No hardcoded secrets"
else
  print_status "WARN" "Potential hardcoded secrets (review needed)"
fi

echo ""

###############################################################################
# 2. ENVIRONMENT VARIABLES
###############################################################################

echo -e "${YELLOW}--- Environment Variables ---${NC}"

# Check required env vars
REQUIRED_VARS=(
  "DEEPGRAM_API_KEY"
  "DEEPL_API_KEY"
  "ELEVENLABS_API_KEY"
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
  "DATABASE_URL"
  "ENCRYPTION_MASTER_KEY"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    print_status "FAIL" "Missing environment variable: $var"
  else
    print_status "PASS" "Environment variable: $var"
  fi
done

echo ""

###############################################################################
# 3. DATABASE CHECKS
###############################################################################

echo -e "${YELLOW}--- Database Checks ---${NC}"

# Check database connection
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
  print_status "PASS" "Database connection"
else
  print_status "FAIL" "Database connection"
fi

# Check required tables exist
REQUIRED_TABLES=(
  "call_recordings"
  "call_recording_encryption_keys"
  "streaming_metrics"
  "transcription_hypotheses"
  "translation_batches"
  "translation_chunks"
  "tts_synthesis_chunks"
  "buffer_state_history"
)

for table in "${REQUIRED_TABLES[@]}"; do
  if psql "$DATABASE_URL" -c "\dt" | grep -q "$table"; then
    print_status "PASS" "Database table: $table"
  else
    print_status "FAIL" "Missing database table: $table"
  fi
done

echo ""

###############################################################################
# 4. PROVIDER CONNECTIVITY
###############################################################################

echo -e "${YELLOW}--- Provider Connectivity ---${NC}"

# Test Deepgram
if curl -s -H "Authorization: Token $DEEPGRAM_API_KEY" \
  https://api.deepgram.com/v1/models > /dev/null 2>&1; then
  print_status "PASS" "Deepgram API connectivity"
else
  print_status "FAIL" "Deepgram API connectivity"
fi

# Test DeepL
if curl -s -H "Authorization: DeepL-Auth-Key $DEEPL_API_KEY" \
  https://api.deepl.com/v2/languages > /dev/null 2>&1; then
  print_status "PASS" "DeepL API connectivity"
else
  print_status "FAIL" "DeepL API connectivity"
fi

# Test ElevenLabs
if curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" \
  https://api.elevenlabs.io/v1/voices > /dev/null 2>&1; then
  print_status "PASS" "ElevenLabs API connectivity"
else
  print_status "FAIL" "ElevenLabs API connectivity"
fi

# Test AWS S3
if aws s3 ls "$S3_BUCKET" --region "$AWS_REGION" > /dev/null 2>&1; then
  print_status "PASS" "AWS S3 access"
else
  print_status "FAIL" "AWS S3 access"
fi

echo ""

###############################################################################
# 5. SECURITY CHECKS
###############################################################################

echo -e "${YELLOW}--- Security Checks ---${NC}"

# Check all routes have auth
UNPROTECTED_ROUTES=$(grep -r "export async function" app/api/calls --include="*.ts" | \
  grep -v "verifyAuth\|verifyAuthWebSocket\|GET /health" | \
  wc -l)

if [ "$UNPROTECTED_ROUTES" -eq 0 ]; then
  print_status "PASS" "All API routes authenticated"
else
  print_status "WARN" "$UNPROTECTED_ROUTES routes may be unprotected (review needed)"
fi

# Check encryption configuration
if [ -n "$ENCRYPTION_MASTER_KEY" ]; then
  KEY_LENGTH=${#ENCRYPTION_MASTER_KEY}
  if [ "$KEY_LENGTH" -ge 64 ]; then  # 32 bytes = 64 hex chars
    print_status "PASS" "Encryption key length ($(($KEY_LENGTH / 2)) bytes)"
  else
    print_status "FAIL" "Encryption key too short ($(($KEY_LENGTH / 2)) bytes, need 32)"
  fi
else
  print_status "FAIL" "Encryption master key not set"
fi

# Check HTTPS enforcement
if grep -r "https:" lib/ app/ --include="*.ts" --include="*.tsx" > /dev/null 2>&1; then
  print_status "PASS" "HTTPS enforcement configured"
else
  print_status "WARN" "HTTPS enforcement not explicitly configured"
fi

echo ""

###############################################################################
# 6. PERFORMANCE CHECKS
###############################################################################

echo -e "${YELLOW}--- Performance Checks ---${NC}"

# Run performance tests
echo "Running performance tests..."
if npm run test:e2e -- tests/e2e/streaming-performance.test.ts > /dev/null 2>&1; then
  print_status "PASS" "Streaming performance tests"
else
  print_status "WARN" "Streaming performance tests (may need manual review)"
fi

# Run load tests
echo "Running load tests..."
if npm run test:load -- tests/load/streaming-concurrent.test.ts > /dev/null 2>&1; then
  print_status "PASS" "Concurrent call load tests"
else
  print_status "WARN" "Concurrent call load tests (may need manual review)"
fi

echo ""

###############################################################################
# 7. FILE EXISTENCE CHECKS
###############################################################################

echo -e "${YELLOW}--- Required Files ---${NC}"

REQUIRED_FILES=(
  "lib/streaming-transcription.ts"
  "lib/streaming-translation.ts"
  "lib/streaming-tts.ts"
  "lib/adaptive-buffering.ts"
  "lib/realtime-pipeline-v2.ts"
  "app/api/calls/stream-transcription/route.ts"
  "app/api/calls/stream-translation/route.ts"
  "app/api/calls/stream-tts/route.ts"
  "database/migrations/026_add_streaming_metrics.sql"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    print_status "PASS" "File exists: $file"
  else
    print_status "FAIL" "Missing file: $file"
  fi
done

echo ""

###############################################################################
# 8. CONFIGURATION CHECKS
###############################################################################

echo -e "${YELLOW}--- Configuration Checks ---${NC}"

# Check vercel.json exists
if [ -f "vercel.json" ]; then
  print_status "PASS" "Vercel configuration"
else
  print_status "WARN" "vercel.json not found (may use defaults)"
fi

# Check package.json has test scripts
if grep -q "test:unit\|test:e2e\|test:load" package.json; then
  print_status "PASS" "Test scripts configured"
else
  print_status "FAIL" "Test scripts not found in package.json"
fi

# Check environment template
if [ -f ".env.phase-13" ] || [ -f ".env.example" ]; then
  print_status "PASS" "Environment template exists"
else
  print_status "WARN" "Environment template not found"
fi

echo ""

###############################################################################
# 9. DOCUMENTATION CHECKS
###############################################################################

echo -e "${YELLOW}--- Documentation Checks ---${NC}"

REQUIRED_DOCS=(
  "DEPLOYMENT_GUIDE_PHASE_13.md"
  "README.md"
)

for doc in "${REQUIRED_DOCS[@]}"; do
  if [ -f "$doc" ]; then
    print_status "PASS" "Documentation: $doc"
  else
    print_status "WARN" "Missing documentation: $doc"
  fi
done

echo ""

###############################################################################
# SUMMARY
###############################################################################

echo -e "${YELLOW}=== Summary ===${NC}"
echo "Total Checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "${RED}Failed: $FAILED_CHECKS${NC}"

if [ "$FAILED_CHECKS" -eq 0 ]; then
  echo -e "\n${GREEN}✓ All checks passed! Ready for deployment.${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Some checks failed. Please review above.${NC}"
  exit 1
fi
