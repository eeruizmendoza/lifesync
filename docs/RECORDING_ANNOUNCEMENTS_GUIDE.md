# Recording Announcements Guide

## Overview

LifeSync includes jurisdiction-specific recording announcements that provide legal compliance for call recording in different US states and countries. This feature automatically detects the caller's location and plays an appropriate audio announcement before recording begins.

## Legal Foundation

Recording laws vary significantly by jurisdiction:

- **Two-Party Consent States** (CA, FL, PA, IL, NY, WA, HI, MD, MT, NH, NJ, VA, VT): All parties must consent to recording before it begins
- **One-Party Consent States** (TX, CO, AZ, NV, etc.): Only one party (the recorder) needs to consent, but all parties must be notified
- **International** (GDPR, CCPA, LGPD): Explicit consent and data processing agreements required

LifeSync uses audio announcements as the primary compliance mechanism because:
1. **Real-time notification**: Announcement plays at the moment recording starts
2. **Proof of consent**: Other party hears announcement and continues = implicit consent
3. **Legal strength**: Courts recognize real-time audio announcements as stronger evidence of consent than pre-call disclaimers
4. **User experience**: Clear, unavoidable notification without intrusive UI changes

## Architecture

### Components

#### 1. **RecordingAnnouncementService** (`lib/recording-announcement-service.ts`)
Core service that generates and manages announcements.

```typescript
// Generate announcement for jurisdiction
const announcement = await playRecordingAnnouncement(
  callId,
  'california',  // jurisdiction
  'en'           // language
);

// Detect jurisdiction from state code
const jurisdiction = detectJurisdiction('CA');  // Returns 'california'

// Get announcement text (for display)
const text = getAnnouncementText('california', 'en');
```

#### 2. **RecordingAnnouncementDialog** (`components/portal/communications/RecordingAnnouncementDialog.tsx`)
React component that displays the announcement dialog to users.

```typescript
<RecordingAnnouncementDialog
  open={announcementOpen}
  callId={callId}
  targetState="CA"
  targetLanguage="en"
  onConsent={handleRecordingConsent}
  onReject={handleRecordingDecline}
/>
```

#### 3. **Recording Announcement API** (`app/api/calls/recording-announcement/route.ts`)
REST API endpoints for generating announcements programmatically.

```bash
# Generate announcement
POST /api/calls/recording-announcement
{
  "callId": "call-001",
  "state": "CA",
  "language": "en"
}

# Get announcement details
GET /api/calls/recording-announcement?callId=call-001&state=CA&language=en
```

### Jurisdiction Templates

The system includes jurisdiction-specific announcements in multiple languages:

```
California (Two-Party Consent):
  EN: "California law requires all-party consent to record..."
  ES: "La ley de California requiere el consentimiento de todas las partes..."
  ZH: "加州法律要求所有参与方同意录制..."

Florida (Two-Party Consent):
  EN: "Florida law requires notification that this call is being recorded..."

Texas (One-Party Consent):
  EN: "Please note: This call is being recorded."
```

## Integration Guide

### Step 1: Detect User Location

When user initiates a call, detect their state:

```typescript
// In PhoneCallDialog or call initiation component
const [userState, setUserState] = useState<string | undefined>();

useEffect(() => {
  // Get from geolocation API, IP lookup, or user profile
  const state = await getUserState();
  setUserState(state);
}, []);
```

### Step 2: Show Announcement Dialog

Before recording starts, show the announcement dialog:

```typescript
import { RecordingAnnouncementDialog, useRecordingAnnouncement } from '@/components/portal/communications/RecordingAnnouncementDialog';

function PhoneCallDialog() {
  const announcement = useRecordingAnnouncement();

  const handleStartRecording = async () => {
    // Show announcement dialog
    announcement.show(callId, userState, userLanguage);
  };

  const handleRecordingConsent = () => {
    // User consented - proceed with recording
    startRecording();
    announcement.close();
  };

  const handleRecordingDecline = () => {
    // User declined - show explanation
    alert('Recording is required to provide translation services.');
    announcement.close();
  };

  return (
    <>
      <RecordingAnnouncementDialog
        open={announcement.open}
        callId={announcement.callId}
        targetState={announcement.state}
        targetLanguage={announcement.language}
        onConsent={handleRecordingConsent}
        onReject={handleRecordingDecline}
      />
    </>
  );
}
```

### Step 3: Log Announcement Event

Log that the announcement was played for audit/compliance:

```typescript
// In the realtime pipeline or call handler
const announcementService = getRecordingAnnouncementService();

await announcementService.playRecordingAnnouncement(
  callId,
  {
    jurisdiction: detectedJurisdiction,
    language: userLanguage,
  }
);

// Get all events for this call
const events = announcementService.getEvents(callId);
// Use for audit trail: events.json stored with recording
```

## API Responses

### POST /api/calls/recording-announcement

```json
{
  "callId": "call-001-california",
  "jurisdiction": "california",
  "language": "en",
  "announcementText": "California law requires all-party consent to record...",
  "durationMs": 4200,
  "isTwoPartyConsent": true,
  "generatedAt": 1234567890
}
```

### GET /api/calls/recording-announcement

Same response structure with query parameters:
- `callId` (required)
- `state` or `jurisdiction` (optional, defaults to one-party consent)
- `language` (optional, defaults to 'en')

## Jurisdiction Reference

### Two-Party Consent States
Require announcement AND explicit consent from all parties before recording:

| State | Code | Announcement |
|-------|------|---|
| California | CA | "California law requires all-party consent to record..." |
| Florida | FL | "Florida law requires notification..." |
| Pennsylvania | PA | "Pennsylvania law requires all-party consent..." |
| Illinois | IL | "Illinois law requires all-party consent..." |
| New York | NY | (General two-party) |
| Washington | WA | (General two-party) |
| Hawaii | HI | (General two-party) |
| Maryland | MD | (General two-party) |
| Montana | MT | (General two-party) |
| New Hampshire | NH | (General two-party) |
| New Jersey | NJ | (General two-party) |
| Virginia | VA | (General two-party) |
| Vermont | VT | (General two-party) |

### One-Party Consent States
Require announcement but only one-party (recorder) consent:

Texas (TX), Colorado (CO), Arizona (AZ), Nevada (NV), and most others

## Supported Languages

- **English** (en) - Full support
- **Spanish** (es) - Full support for all jurisdictions
- **Mandarin Chinese** (zh) - Full support
- **Additional languages**: Can be added by extending `ANNOUNCEMENT_TEMPLATES`

## Database/Logging

Store announcement events with the recording for compliance:

```sql
-- announcement_events table
INSERT INTO announcement_events (
  call_id,
  event_type,       -- 'announcement_generated' | 'announcement_played' | 'announcement_failed'
  jurisdiction,
  language,
  announcement_text,
  duration_ms,
  timestamp,
  user_consent
) VALUES (...)
```

## Best Practices

### 1. Mandatory Before Recording
Never start recording without playing the announcement:

```typescript
// ✅ CORRECT
await playRecordingAnnouncement(callId, jurisdiction, language);
const recordingConsented = await waitForUserConsent();
if (!recordingConsented) return;
startRecording();

// ❌ WRONG
startRecording();  // Don't do this - no announcement!
```

### 2. Both Parties Hear It
Announcement should play to both participants via the WebRTC audio:

```typescript
// Send announcement audio through peer connection
const audioTrack = await audioContext.createMediaStreamSource(announcementAudio);
peerConnection.addTrack(audioTrack);
```

### 3. Log Everything
Keep audit trail of announcements for legal compliance:

```typescript
const events = announcementService.getEvents(callId);
// Save events with recording metadata
saveRecordingMetadata({
  callId,
  recordingStartTime: Date.now(),
  announcementEvents: events,
});
```

### 4. Jurisdiction Detection
Always use actual location data, not just IP:

```typescript
// ✅ GOOD - Use actual user state
const jurisdiction = detectJurisdiction(userProfile.state);

// ⚠️ RISKY - IP geolocation can be wrong
const jurisdiction = detectJurisdiction(ipGeoLocation.state);

// ❌ WRONG - Guessing
const jurisdiction = 'one-party-consent';  // Default
```

### 5. Handle Declining Users
If user declines, explain why recording is necessary:

```typescript
const handleRecordingDecline = () => {
  // Explain that recording is required
  alert(
    'Recording is required to:\n' +
    '• Provide real-time translation\n' +
    '• Encrypt your call data\n' +
    '• Generate call transcripts\n\n' +
    'Without recording, translation services cannot function.'
  );
};
```

## Testing

### Unit Tests
Test jurisdiction detection and announcement generation:

```bash
npm run test -- recording-announcement.test.ts
```

### Integration Tests
Test full announcement flow with API:

```bash
# Start test server
npm run dev

# Run integration tests
npm run test:e2e -- recording-announcement.test.ts
```

### Manual Testing Checklist

- [ ] California call shows CA-specific announcement with consent language
- [ ] Florida call shows FL-specific announcement with notification language
- [ ] Texas call shows one-party consent simplified announcement
- [ ] Spanish language announcement displays correctly
- [ ] Chinese language announcement displays correctly
- [ ] "Play again" button replays announcement audio
- [ ] User can consent and proceed with call
- [ ] User can decline and call doesn't start
- [ ] Announcement duration is correct (5-15 seconds typical)
- [ ] Events are logged for audit trail

## Compliance Checklist

Use this checklist to ensure legal compliance:

- [ ] Announcements play automatically before recording starts
- [ ] Both call participants hear the announcement
- [ ] Announcement is jurisdiction-specific (not generic)
- [ ] Announcement explains the recording and consent requirement
- [ ] User must explicitly confirm consent (continue/accept button)
- [ ] Announcement events are logged with timestamp
- [ ] Logs stored with recording for 7 years (legal requirement)
- [ ] Two-party consent states block recording if consent not given
- [ ] Non-US jurisdictions have GDPR/CCPA-compliant announcements
- [ ] Privacy policy updated with recording disclosure
- [ ] Terms of Service reference recording announcements
- [ ] Vendor DPAs include recording disclosure
- [ ] Recordings are encrypted (XChaCha20-Poly1305)
- [ ] Recordings deleted automatically after 90 days
- [ ] User can request deletion anytime (GDPR/CCPA)

## Troubleshooting

### Audio Not Playing

**Problem**: Announcement doesn't play to other participant

**Solutions**:
1. Verify WebRTC audio track is active
2. Check browser audio permissions
3. Verify TTS service is generating audio (not returning silence)
4. Check browser console for errors

### Wrong Jurisdiction Detected

**Problem**: User in California sees Texas announcement

**Solutions**:
1. Verify state code is correct (uppercase: 'CA' not 'ca')
2. Check geolocation API accuracy
3. Allow users to override state manually
4. Use IP geolocation as fallback only

### Announcement Too Long/Short

**Problem**: Announcement duration estimate is incorrect

**Solutions**:
1. Adjust word-per-second calculation (currently 2.5)
2. Use TTS service's actual duration (not estimate)
3. Hardcode duration for pre-recorded announcements
4. Test with multiple TTS providers

## Future Enhancements

1. **Pre-recorded announcements**: Instead of TTS, use professional voice talent
2. **Multi-language support**: Add more languages (French, German, Mandarin, etc.)
3. **Voice clone**: Use caller's voice for announcement personalization
4. **Visual subtitle**: Show announcement text as subtitle during playback
5. **International expansion**: Add GDPR/CCPA/LGPD specific announcements
6. **Consent video**: Record user's verbal consent for extra legal protection

## References

- Federal Wiretap Act (18 U.S.C. § 2511)
- California Penal Code § 632
- Florida Statute § 934.03
- GDPR Article 6 (Lawfulness of Processing)
- CCPA Section 1798.100 (Consumer Rights)
- LGPD Article 7 (Lawfulness of Processing)

---

**Last Updated**: 2026-05-21
**Status**: Phase 13.3 (Legal Compliance)
**Maintainer**: LifeSync Engineering Team
