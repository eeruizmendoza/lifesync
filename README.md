# LifeSync - Private Social Network & Communications Hub

A unified inbox for all your communications (email, SMS, calls, voicemails) combined with a private social network for your real contacts only.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Neon PostgreSQL database
- Twilio account (for SMS verification)

### Setup

1. **Environment variables** (`.env.local`):
```env
DATABASE_URL=postgresql://...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
ENCRYPTION_KEY=...
JWT_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

2. **Set up database:**
```bash
psql $DATABASE_URL < database/schema.sql
```

3. **Run dev server:**
```bash
npm run dev
```

Visit `http://localhost:3000/login`

## 📋 Development Phases

### ✅ Phase 0: Foundation (COMPLETE)
- [x] Next.js 16 project setup
- [x] Neon PostgreSQL database schema
- [x] AES-256-GCM encryption
- [x] Phone + SMS authentication
- [x] Login page UI

### 🟡 Phase 1: Social Feed (IN PROGRESS)
- [ ] Create/edit posts
- [ ] Post feed
- [ ] Likes, comments, reactions

### 🔲 Phase 2: Contact System
- [ ] Contact import
- [ ] Invitations
- [ ] Network visibility

### 🔲 Phase 3: Communications Aggregation
- [ ] Gmail integration
- [ ] SMS/iMessage import
- [ ] Unified inbox

### 🔲 Phase 4: Advanced Features
- [ ] Video/reels
- [ ] Voicemail transcription
- [ ] Data export

## 🛠️ Tech Stack

- Next.js 16 (TypeScript)
- Neon PostgreSQL
- Twilio SMS
- AES-256-GCM Encryption
- Tailwind CSS

## 📄 License

Private project. All rights reserved.
# Deployment test
