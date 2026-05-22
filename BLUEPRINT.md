# LifeSync — Product Blueprint v2.0
**Date**: 2026-05-22 | **Status**: Active — replaces all prior specs

---

## What LifeSync Is

**LifeSync is a universal communication hub with real-time translation built into every channel.**

It is not a restoration industry tool. It is not a business-specific operating system. It is an independent app sold on the App Store for anyone — individuals, teams, businesses — who communicates across language barriers in their daily life or work.

The core idea is simple: **every type of communication you already use (texts, calls, video, email, messages, files, photos), organized per contact in one timeline, with translation automatically applied to all of it.**

There are two modes that make LifeSync unlike anything else on the market:

### Mode 1 — Personal Communication Hub (Mobile)
Your phone becomes the single place where every conversation lives. One timeline per contact. Every SMS, every call, every video, every email, every file, every photo — all translated into your language, all in one scroll. You stop switching between Messages, WhatsApp, Gmail, and phone apps. It all lives here.

### Mode 2 — Room Mode (Conference / Shared Screen)
A full-screen experience designed for a tablet on a conference table, a phone propped up between two people, or a TV screen in a meeting room. Everyone speaks their own language. LifeSync transcribes it in real-time, translates it, and shows (and optionally speaks) the translation for every other person in the room. No interpreter. No expensive service. Just open the app, tap Room Mode, and speak.

**These two modes are the same app.** After a Room Mode session ends, the full transcript and AI summary appear in that contact's timeline automatically.

---

## Who Uses LifeSync

- **Business owners** communicating with clients, vendors, or contractors who speak different languages
- **Field workers** (construction, healthcare, real estate, legal) who work with multilingual clients daily
- **Travelers and expats** who need to communicate locally without switching apps
- **International teams** that collaborate across language barriers
- **Anyone in a meeting** where multiple languages are spoken — a doctor and patient, a buyer and seller, a lawyer and client, a contractor and homeowner
- **Families** with members across countries and languages

---

## The Product Experience

### Contact-Centered Design
Everything revolves around a contact. When you open someone's profile, you see their entire communication history with you — regardless of channel — in a single chronological timeline:

```
[Yesterday 3:42 PM]  📱 SMS  "Cuando llega el técnico?"
                     ↳ You replied: "En 30 minutos" (translated from "In 30 minutes")

[Yesterday 4:15 PM]  📞 Call  18 min · Spanish ↔ English · Recording saved

[Yesterday 4:52 PM]  📎 File  "insurance_estimate.pdf" shared

[Today 9:10 AM]      💬 Chat  "Can you send the photos from yesterday?"
                     ↳ (translated: "¿Puedes enviar las fotos de ayer?")

[Today 9:14 AM]      📷 Photo  3 photos attached

[Today 11:00 AM]     📧 Email  "Re: Estimate approval" · Gmail
```

Every message type has the same translation layer. You always read in your language. The other person always reads in theirs.

### Room Mode Experience
Designed for a shared physical space:

1. User taps **Room Mode** from home screen
2. Selects languages for each "seat" (up to 6 participants)
3. App goes full-screen — large, readable text
4. Each person taps their language zone and speaks
5. Translation appears instantly in everyone else's zone
6. Optional: text-to-speech reads the translation aloud
7. Optional: mirror to TV via AirPlay or Chromecast
8. Session ends → full transcript + AI summary saved to contact timeline

---

## Communication Channels

| Channel | Description | Translation |
|---|---|---|
| **In-App Chat** | Real-time text messages between LifeSync users | ✅ Auto-translated |
| **SMS** | Two-way SMS via a LifeSync phone number (Twilio) | ✅ Auto-translated |
| **Voice Calls** | ✅ Already built — real-time interpreted calls | ✅ Real-time |
| **Video Calls** | ✅ Already built — translated video calls | ✅ Real-time |
| **Voice Messages** | Short recorded audio clips, auto-transcribed | ✅ Transcribed + translated |
| **Email** | Connect Gmail / Outlook — read and send from LifeSync | ✅ AI-translated |
| **File Sharing** | PDFs, Word docs, spreadsheets, contracts | ✅ AI-translated content |
| **Photo Sharing** | Camera, gallery, or attachments | ✅ OCR + translate visible text |
| **Room Mode** | Live in-person multi-party translation | ✅ Real-time |

---

## What Is Already Built (Foundation — DO NOT REBUILD)

The translation + calling layer is complete and production-deployed. This is the engine at the core of LifeSync. Every new channel we add translates using the same infrastructure.

| What Exists | Detail |
|---|---|
| Real-time translated voice calls | Live two-way interpretation, any language pair |
| Real-time translated video calls | Same pipeline, video channel |
| Call recording + encryption | XChaCha20-Poly1305, S3 storage, per-user keys |
| Transcription + translation | Whisper + DeepL pipeline, stored per recording |
| Contact management | Tags, notes, company, pin, language preference |
| External contacts | Non-platform contacts with CSV import |
| User presence | Online/recent indicators |
| Notifications | In-app bell, email notifications, follow-up reminders |
| Global search | Contacts + calls + transcripts |
| Multi-tenant org system | Organizations, members, roles, billing, quotas |
| Stripe billing | Checkout, portal, webhooks, plan enforcement |
| API keys + webhooks | Developer access, signed webhook delivery |
| Audit log | Full org event trail |
| Admin dashboard | Super-admin platform management |
| Home dashboard | Stats, recent activity, pinned contacts |
| Marketing site + pricing page | Public-facing pages |
| Rate limiting | Fixed-window per-user and per-IP |
| Auth system | Phone OTP + JWT, no password needed |

---

## What Needs to Be Built (Ordered by Priority)

### Block 1 — The Hub Core (Phases 46–49)
These make LifeSync a real communication hub, not just a call app.

**Phase 46 — Unified Contact Timeline**
The central experience. Every communication type per contact displayed in one scrollable thread. This is the "home" for a contact — calls, future chats, future SMS, future emails all flow into this view. Build the shell now, channels populate it over time.
- `messages` table (universal message store: type, channel, direction, content, translated_content, media_url, language)
- `/contacts/[id]/timeline` route — merged view of all interaction types
- Timeline component — channel-specific icons, translation toggle, media preview, pagination
- Replaces the current "last 20 calls" in ContactDetail

**Phase 47 — In-App Messaging (Translated Chat)**
Real-time text messages between LifeSync users. The simplest new channel. Uses existing user graph.
- WebSocket or Server-Sent Events for real-time delivery
- `messages` table (channel='chat')
- Auto-translate on send: sender sees original, receiver sees translated
- Chat UI in contact timeline + floating chat panel
- Typing indicators, read receipts, message reactions (emoji)
- Unread badge in sidebar

**Phase 48 — Voice Messages**
Short audio clips (up to 3 minutes), recorded in-app. Auto-transcribed and translated. Sent like a message.
- Record button in chat
- Upload to S3, run Whisper transcription
- Translate transcript with DeepL
- Display as audio player + transcript in timeline
- Notification: "New voice message from [contact]"

**Phase 49 — File + Photo Sharing**
Send/receive files and photos in any conversation. Photos from camera or gallery. Files from device storage or email attachments.
- S3 upload with presigned URLs
- Image preview inline in timeline
- File download with type icons (PDF, DOC, XLS, etc.)
- OCR on images via OpenAI Vision → translate visible text
- Camera capture on mobile (PWA camera API)
- 50MB per file limit, 500MB per user free tier

---

### Block 2 — New Channels (Phases 50–52)

**Phase 50 — SMS Integration (Twilio)**
Two-way SMS from a LifeSync phone number. Outbound SMS translated before sending. Inbound SMS auto-translated on receipt. All SMS threads appear in the contact's unified timeline.
- Twilio number provisioning per user (or per org)
- Inbound: Twilio webhook → store in `messages` table, translate, notify
- Outbound: user types in their language → translate → Twilio send
- Thread view grouped by phone number
- MMS support (images via Twilio)
- Toll-free or local number options

**Phase 51 — Email Integration (Gmail + Outlook OAuth)**
Connect an existing Gmail or Outlook account. Emails from known contacts appear in their timeline in LifeSync, translated. Reply directly from LifeSync. Attachments inline.
- OAuth 2.0 for Gmail (`gmail.modify` scope) and Microsoft Graph
- Fetch inbox, sent, specific threads
- Store in `messages` table (channel='email')
- AI translation of email body
- Reply via API (Gmail send, Graph send)
- Attachment download + inline preview
- Sync every 5 minutes (background job) or real-time via Gmail push

**Phase 52 — Room Mode**
The conference room / meeting translation experience. Biggest market differentiator.
- Full-screen UI, landscape optimized for tablet
- Up to 6 language "zones" per session
- Tap-to-speak (push-to-talk) or voice-activity detection
- Real-time Whisper transcription (streaming)
- Instant DeepL translation
- Large text output per zone
- Text-to-speech: speaks translation aloud (device speaker)
- AirPlay / Chromecast: mirror to room TV
- Session recording option
- Session ends → transcript + AI summary → stored in contact's timeline
- "Quick Room" mode: just two languages, instant start, no setup

---

### Block 3 — Intelligence Layer (Phases 53–54)

**Phase 53 — AI Communication Summary**
After every interaction (call, chat thread, email), Claude/GPT-4 generates a structured summary:
- Key decisions made
- Action items with owner + deadline
- Topics discussed
- Sentiment (positive / neutral / tense)
- One-sentence digest
Summaries appear in contact timeline. Searchable. Exportable. Feeds the weekly digest email.

**Phase 54 — Smart Notifications + Nudges**
- "You haven't spoken to [contact] in 30 days" reminder
- Follow-up suggestions based on last interaction ("They mentioned calling back Thursday")
- Unread message summaries: "3 unread messages from 2 contacts — here's the summary"
- Language learning mode: show both languages side-by-side with pronunciation guides

---

### Block 4 — Platform & Mobile (Phases 55–56)

**Phase 55 — Progressive Web App (PWA)**
Make LifeSync installable on iOS and Android from the browser. Required for App Store submission path.
- `manifest.json` with icons, theme, display: standalone
- Service worker for offline caching of contacts + recent messages
- Push notifications via Web Push API (works on iOS 16.4+)
- Camera API for photo capture
- Microphone permissions handled for Room Mode
- App icon, splash screen, status bar styling
- Capacitor wrapper for App Store submission (iOS) and Google Play

**Phase 56 — Mobile-First UI Redesign**
The current UI was designed for desktop/web. Rebuild navigation and key screens for thumb-friendly mobile use.
- Bottom tab bar (Home, Messages, Contacts, Room, Settings) replaces sidebar
- Swipe gestures for conversation navigation
- Large touch targets throughout
- Pull-to-refresh on timeline and inbox
- Optimized for iPhone + Android viewport sizes
- Tablet layout for Room Mode

---

## Navigation Structure (New)

### Mobile (Phone)
```
Bottom Tab Bar:
├── Home          — Dashboard: recent conversations, pinned contacts, stats
├── Messages      — Unified inbox: all channels, sorted by latest activity
├── Contacts      — Contact list + external contacts
├── Room          — Room Mode launcher
└── Settings      — Profile, language, notifications, connected accounts
```

### Tablet / Room Mode
```
Home → tap "Room Mode" → full-screen Room Mode UI
```

### Web / Desktop (Conference Room Screen)
```
Sidebar nav (existing) + Room Mode accessible from any page
```

---

## Technical Architecture Changes

### New Database Tables Needed

```sql
-- Universal message store (all channels flow here)
messages (
  id, contact_id, user_id, channel,  -- 'chat'|'sms'|'email'|'voicemail'|'file'|'photo'
  direction,                          -- 'inbound'|'outbound'
  content_original, content_translated,
  source_language, target_language,
  media_url, media_type, media_size,
  subject,                            -- email only
  external_id,                        -- Twilio SID, Gmail message-id, etc.
  read_at, delivered_at,
  ai_summary,
  created_at, deleted_at
)

-- Real-time chat sessions (WebSocket state)
chat_sessions (
  id, user_id, contact_id, last_message_at, unread_count
)

-- Room Mode sessions
room_sessions (
  id, host_user_id, title, languages[],
  started_at, ended_at, participant_count,
  transcript, ai_summary, recording_url
)

room_session_turns (
  id, session_id, speaker_label, speaker_language,
  original_text, translations JSONB,  -- {en: "...", es: "...", zh: "..."}
  started_at_ms, duration_ms
)

-- Connected accounts (Gmail, Outlook, etc.)
connected_accounts (
  id, user_id, provider,  -- 'gmail'|'outlook'|'twilio'
  access_token_encrypted, refresh_token_encrypted,
  phone_number,           -- Twilio number
  email_address,          -- Gmail/Outlook address
  sync_enabled, last_synced_at
)
```

### Existing Infrastructure to Reuse
- **Translation**: DeepL pipeline already wired — call it for any text
- **Transcription**: Whisper pipeline already wired — call it for any audio
- **Encryption**: XChaCha20-Poly1305 already built — apply to messages
- **S3 storage**: File upload/download already built — use for photos/files
- **Notifications**: In-app + email notification system already built
- **WebSockets**: WebSocket infrastructure exists in realtime-pipeline.ts
- **Auth**: JWT + phone OTP already works on mobile browsers

---

## App Store & Platform Strategy

### Phase 1: PWA (Now → Q3 2026)
Ship what we have as a Progressive Web App. Users install from browser. Full functionality. Works on iOS 16.4+ and all Android. Allows push notifications and camera access.

### Phase 2: Capacitor Wrapper (Q3 2026)
Wrap the PWA in Capacitor to create a true App Store binary. Submit to Apple App Store and Google Play. Minimal additional code needed. Gets LifeSync a proper App Store listing, ratings, and discoverability.

### Phase 3: Native Enhancement (Q4 2026+)
Add Capacitor plugins for background audio (Room Mode when screen is off), deeper camera integration, and background SMS sync. Native feel without a full React Native rewrite.

---

## Pricing (App Store — Revised from Enterprise SaaS)

| Tier | Price | What You Get |
|---|---|---|
| **Free** | $0/mo | 50 translated messages/mo, 10 min calls/mo, Room Mode (2 languages, 30 min/session) |
| **Personal** | $9.99/mo | Unlimited messages + calls, Room Mode unlimited, 1 connected email, 5GB storage |
| **Teams** | $29.99/mo | Everything in Personal × up to 10 users, shared contacts, org timeline, admin controls |
| **Business** | $79.99/mo | Everything in Teams × unlimited users, SMS numbers, priority transcription, API access |

Annual plans: 2 months free (pay 10, get 12).

> Note: The current $299/$599/$999/mo pricing was designed for the restoration industry SaaS. Those tiers may be kept for large enterprise/white-label deals but are not the App Store pricing.

---

## Competitive Positioning

| Product | What It Does | LifeSync Advantage |
|---|---|---|
| Google Translate | Translates text, no communication features | LifeSync is the whole conversation, not just a translator |
| iTranslate | Translation app, some voice features | No hub, no call history, no email, no team features |
| Interprefy / Kudo | Professional conference interpretation | $500-2000/session; LifeSync = $9.99/mo |
| WhatsApp | Messaging, calls, no translation | No translation, no email, no unified hub |
| Front / Superhuman | Unified inbox, no translation | No real-time translation, no voice/video, not mobile-first |
| Slack | Team messaging, limited translation bots | Not personal, not multilingual-first, no SMS/email |

**LifeSync's moat**: The only app that combines ALL communication channels + real-time translation + Room Mode in a single mobile app. Nothing else does this.

---

## Build Roadmap (From Today)

| Phase | Name | Est. Time | Deliverable |
|---|---|---|---|
| **46** | Unified Contact Timeline | 1 week | `messages` table + timeline UI replacing call-only view |
| **47** | In-App Chat | 1 week | Real-time translated chat, unread badges, typing indicators |
| **48** | Voice Messages | 3 days | Record → transcribe → translate → play inline |
| **49** | File + Photo Sharing | 1 week | S3 upload, inline preview, OCR translation on images |
| **50** | SMS via Twilio | 1 week | Two-way translated SMS, Twilio webhooks, number provisioning |
| **51** | Email Integration | 2 weeks | Gmail + Outlook OAuth, translated inbox, reply from LifeSync |
| **52** | Room Mode | 2 weeks | Full-screen multi-party real-time translation, session transcript |
| **53** | AI Summaries | 1 week | Post-call/chat Claude summaries: decisions, action items, sentiment |
| **54** | Smart Notifications | 3 days | Re-engagement nudges, unread digests, follow-up suggestions |
| **55** | PWA + App Store | 1 week | Installable app, push notifications, Capacitor wrapper |
| **56** | Mobile UI Redesign | 2 weeks | Bottom tabs, swipe nav, mobile-optimized layouts |

**Total**: ~14 weeks to full vision
**MVP for App Store**: Phases 46–49 + 52 + 55 = ~6 weeks

---

## Success Metrics

- **Activation**: User completes first translated call or sends first translated message within 24h of signup
- **Retention D30**: 40%+ of users still active after 30 days
- **Room Mode adoption**: 20%+ of users try Room Mode within 7 days
- **Channel breadth**: Average user uses 2+ channels (not just calls)
- **App Store rating**: 4.5+ stars
- **Translation quality**: <5% user correction rate on translations
- **Conversion**: 15%+ of free users convert to Personal within 30 days

---

*Blueprint v2.0 — Created 2026-05-22*
*Supersedes: SAAS_SPECIFICATION_2026_05_09.md, unified_communications_system_architecture.md*
*Next action: Confirm blueprint → begin Phase 46 (Unified Contact Timeline)*
