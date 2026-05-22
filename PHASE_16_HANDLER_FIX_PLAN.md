# Phase 16: API Handler Logic & Database Integration Fix
## Implementation Plan — 2026-05-21

---

## Current Status

**Test Suite**: 307/348 passing (88.2% ✅)

**Passing Categories**:
- ✅ All E2E streaming tests (14/14)
- ✅ All research pipeline tests (23/23)
- ✅ All unit tests for core logic (80+)
- ✅ All encryption/security tests (20+)
- ✅ All provider failover tests (8+)
- ✅ All state machine tests (10+)

**Failing Categories** (41 failures):
- ❌ API handler response logic (12 tests in call-signaling)
- ❌ Database persistence (9 tests in complete-call-workflow)
- ❌ Load/concurrent behavior (8 tests in streaming-concurrent)
- ❌ Security injection prevention (8 tests)
- ❌ Input validation (4 tests)

---

## Failure Breakdown

### Category 1: API Handler Status Codes (15 failures)
**File**: `tests/integration/call-signaling.test.ts`

**Problem**: Routes exist and respond, but with wrong HTTP status codes

**Examples**:
```
Test: "successfully initiates a call"
Expected: 200
Received: Likely 401 or 500

Test: "rejects missing required fields"  
Expected: 400
Received: Unknown (handler logic not validating)
```

**Fix Strategy**:
1. Review `/app/api/calls/initiate/route.ts` line 44 (POST handler)
2. Ensure it returns 200 for valid requests
3. Ensure it returns 400 for validation failures
4. Same for: accept, reject, hold, resume, end, metrics, status

**Affected Files**:
- `app/api/calls/initiate/route.ts` → POST validation logic
- `app/api/calls/accept/route.ts` → Response status
- `app/api/calls/end/route.ts` → Response status
- `app/api/calls/hold/route.ts` → Action handling
- `app/api/calls/metrics/route.ts` → Metrics retrieval
- (7 more handler files with similar issues)

---

### Category 2: Database Persistence (9 failures)
**File**: `tests/integration/complete-call-workflow.test.ts`

**Problem**: API handlers create calls but don't persist to database

**Example**:
```sql
SELECT * FROM conversations WHERE id = 'call_123' 
-- Returns 0 rows (handler didn't create record)
```

**Root Causes**:
1. Database operations are commented out (marked TODO)
2. Handlers use in-memory registry only
3. Tests expect persistent storage

**Fix Strategy**:
1. Uncomment database operations in each API handler
2. Verify Neon connection is working
3. Ensure transactions are properly committed
4. Add error handling for database failures

**Files with TODOs**:
```
app/api/calls/initiate/route.ts  (lines 131-145)
  - "TODO: Uncomment when database is ready"
  - const conversation = await db.conversation.create(...)

app/api/calls/accept/route.ts   (similar TODO)
app/api/calls/end/route.ts      (similar TODO)
app/api/calls/recording/route.ts (similar TODO)
```

---

### Category 3: Load Testing Metrics (8 failures)
**File**: `tests/load/streaming-concurrent.test.ts`

**Problem**: Metrics values are 0 instead of populated

**Example**:
```typescript
const metrics = processor.getMetrics();
expect(metrics.bufferSizeMs).toBeGreaterThan(0); // Fails: = 0
expect(metrics.transcriptionLatency).toBeGreaterThan(0); // Fails: = 0
```

**Root Causes**:
1. Metrics not being captured during streaming
2. Processor state not being updated
3. Load test environment doesn't simulate real traffic

**Fix Strategy**:
1. Add metrics collection to StreamingCallProcessor
2. Ensure metrics are populated during playback
3. Create test fixtures with realistic concurrent load
4. Fix expectations for synthetic test environment

**Affected Files**:
- `lib/realtime-pipeline-v2.ts` → getMetrics() method
- `tests/load/streaming-concurrent.test.ts` → Test expectations

---

### Category 4: Security Tests (8 failures)
**File**: `tests/security/*.test.ts`

**Problem**: Injection prevention tests hitting actual API, no sanitization

**Examples**:
```
"SQL injection via contactId" → API accepts: "'; DROP TABLE--"
"XSS via translation output" → Returns unsanitized: "<script>alert(1)</script>"
```

**Fix Strategy**:
1. Add input sanitization to all API handlers
2. Use parameterized queries (already in Neon)
3. HTML-escape translation output
4. Validate all input against schema

**Files to Secure**:
- `app/api/calls/initiate/route.ts` → Sanitize contactId
- `app/api/calls/*/route.ts` → All routes need input validation
- `lib/streaming-translation.ts` → HTML-escape output
- Database calls → Use prepared statements

---

## Implementation Order (Priority)

### Priority 1 (Fix First) — Unblocks Everything Else
1. **Fix initiate/route.ts response logic**
   - Make successful requests return 200
   - Add proper error responses (400, 401, 500)
   - Time: 30 min

2. **Uncomment database operations**
   - Find all TODO comments
   - Uncomment db.conversation.create() calls
   - Test database connectivity
   - Time: 45 min

### Priority 2 — Core Functionality
3. **Fix remaining API handlers** (accept, end, hold, metrics)
   - Same pattern as initiate
   - Status codes + database writes
   - Time: 1 hour

4. **Add input validation & sanitization**
   - Validate language codes
   - Validate contact IDs
   - Sanitize user inputs
   - Time: 45 min

### Priority 3 — Quality
5. **Fix metrics collection**
   - Update StreamingCallProcessor.getMetrics()
   - Capture real metrics during calls
   - Time: 30 min

6. **Security hardening**
   - Add SQL injection prevention (parameterized queries)
   - Add XSS protection (output escaping)
   - Time: 1 hour

---

## Testing Strategy

### After Each Fix
```bash
# Run the specific affected test suite
npm run test -- tests/integration/call-signaling.test.ts

# Run all to see progress
npm run test

# Expect: Test count increases as handlers work correctly
```

### Target State
```
Test Suites: 0 failed, 21 passed ✅
Tests: 348 passed, 0 failed ✅
Pass Rate: 100% 🎉
```

---

## Code Patterns

### Pattern 1: API Handler Status Code
```typescript
// Current (incorrect)
export async function POST(request: NextRequest) {
  const data = await request.json();
  // ... do stuff
  return NextResponse.json({ callId: '...' }); // Missing status
}

// Correct
export async function POST(request: NextRequest) {
  const data = await request.json();
  
  if (!data.required_field) {
    return NextResponse.json(
      { error: 'Missing required field' },
      { status: 400 } // ← Specify status
    );
  }
  
  // ... do stuff
  
  return NextResponse.json(
    { callId: '...', status: 'ringing' },
    { status: 200 } // ← Success status
  );
}
```

### Pattern 2: Uncomment Database Operations
```typescript
// Current (commented)
/*
const conversation = await db.conversation.create({
  data: { /* ... */ }
});
*/

// Fix: Uncomment and add error handling
try {
  const conversation = await db.conversation.create({
    data: {
      id: callId,
      type: callType,
      sourceLanguage,
      targetLanguage,
      callerId: caller.id,
      receiverId: contactId,
      startedAt: new Date(),
    },
  });
  
  if (!conversation) {
    throw new Error('Failed to create conversation');
  }
} catch (error) {
  console.error('Database error:', error);
  return NextResponse.json(
    { error: 'Failed to create call' },
    { status: 500 }
  );
}
```

### Pattern 3: Input Validation
```typescript
// Validate language codes
const validLanguages = ['en', 'es', 'zh', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko'];

if (!validLanguages.includes(sourceLanguage) || !validLanguages.includes(targetLanguage)) {
  return NextResponse.json(
    { error: `Invalid language. Supported: ${validLanguages.join(', ')}` },
    { status: 400 }
  );
}

// Validate UUID format
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(contactId)) {
  return NextResponse.json(
    { error: 'Invalid contact ID format' },
    { status: 400 }
  );
}
```

---

## Files Requiring Changes

### High Priority
- [ ] `app/api/calls/initiate/route.ts` (70 lines)
- [ ] `app/api/calls/accept/route.ts` (60 lines)
- [ ] `app/api/calls/end/route.ts` (55 lines)
- [ ] `app/api/calls/hold/route.ts` (50 lines)
- [ ] `app/api/calls/metrics/route.ts` (45 lines)

### Medium Priority
- [ ] `app/api/calls/reject/route.ts` (50 lines)
- [ ] `app/api/calls/resume/route.ts` (50 lines)
- [ ] `app/api/calls/status/route.ts` (55 lines)
- [ ] `app/api/calls/stream-transcription/route.ts` (65 lines)

### Supporting Files
- [ ] `lib/realtime-pipeline-v2.ts` → getMetrics() implementation
- [ ] `tests/integration/call-signaling.test.ts` → May need fixture updates
- [ ] `tests/integration/complete-call-workflow.test.ts` → Database fixture

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Test Pass Rate | 88.2% | 100% |
| Failing Tests | 41 | 0 |
| API Status Codes | Incorrect | Correct |
| Database Persistence | None | Full |
| Input Validation | Partial | Complete |
| Security (Injections) | Vulnerable | Protected |

---

## Estimated Timeline

- **Phase 16.1** (Priority 1): 1.5 hours
- **Phase 16.2** (Priority 2): 2 hours  
- **Phase 16.3** (Priority 3): 1.5 hours
- **Verification**: 30 min
- **Total**: ~5 hours

**Target Completion**: Within same session after Phase 15

---

## Next Actions

1. ✅ Phase 15: COMPLETE (routing fixed)
2. 📋 Phase 16.1: Start with `initiate/route.ts`
3. 📋 Phase 16.2: Uncomment database operations
4. 📋 Phase 16.3: Security hardening
5. 📋 Validation: 100% tests passing
6. 📋 Phase 17: Production readiness

Ready to proceed to Phase 16.1!
