# LifeSync — Getting Started

## 🎯 You Have Built

A completely **separate, independent application** called **LifeSync** that is:
- ✅ Completely separate from DRR website and portal
- ✅ Built as a new Next.js 16 project
- ✅ Ready to deploy to a separate domain (lifesync.app)
- ✅ Using a separate Neon PostgreSQL database
- ✅ With end-to-end encryption from day 1

---

## 🚀 To Get Started

### 1. Set Up Environment

Create `.env.local` in `/Users/eduardoruiz/Desktop/lifesync/`:

```env
# Database (Get from Neon)
DATABASE_URL=postgresql://user:password@host/dbname

# Twilio (Get from Twilio dashboard)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# Encryption Key (Generate)
ENCRYPTION_KEY=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# JWT Secret
JWT_SECRET=your_secret_key_here

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 2. Set Up Database

```bash
cd /Users/eduardoruiz/Desktop/lifesync

# Connect to your Neon database and run:
psql $DATABASE_URL < database/schema.sql
```

### 3. Run Dev Server

```bash
npm run dev
```

Visit: http://localhost:3000/login

### 4. Test Login Flow

- Enter phone: `+15551234567` (any format)
- Check SMS (Twilio will send code)
- Enter code → Logged in!

---

## 📝 Important Notes

### NOT Connected to DRR
- ✅ Separate GitHub repo needed
- ✅ Separate domain (lifesync.app)
- ✅ Separate database
- ✅ Separate authentication (phone + SMS, not Clerk)
- ✅ Completely independent

### DRR Portal Untouched
- The `/app/(portal)/` code is UNTOUCHED
- The `/app/(frontend)/` marketing site is UNTOUCHED
- All DRR infrastructure remains as-is
- Zero changes to your main project

---

## 🔐 Security Already Implemented

✅ AES-256-GCM encryption for all data  
✅ Secure phone verification (no passwords)  
✅ HTTP-only JWT cookies  
✅ Soft-delete with 30-day retention  
✅ Encrypted token storage  
✅ Audit logging  

---

## 📋 What's Next?

**Phase 1 — Social Feed** (ready to build):
- Create posts (text, photos, videos)
- Post feed display
- Likes, comments, reactions
- User profiles

**Phase 2 — Contacts** (after Phase 1):
- iPhone contact import
- Invitation system
- Network visualization

**Phase 3 — Communications Aggregation** (after Phase 2):
- Gmail integration
- SMS/iMessage import
- Unified inbox

**Phase 4 — Advanced** (after Phase 3):
- Voicemail transcription
- Video reels
- Data export

---

## 🛠️ Tech Stack Reference

```
Frontend: React + Next.js 16 + Tailwind CSS
Backend: Next.js API routes + Node.js
Database: Neon PostgreSQL (serverless)
Auth: Phone + SMS + JWT
Encryption: AES-256-GCM
Services: Twilio (SMS)
Deployment: Vercel (ready)
```

---

## 📂 Project Location

```
/Users/eduardoruiz/Desktop/lifesync/
```

## 🔗 Important Links

- **Database Schema**: `/database/schema.sql`
- **Auth Logic**: `/lib/auth.ts`
- **Encryption**: `/lib/encryption.ts`
- **Database Client**: `/lib/db.ts`
- **Environment Template**: `/.env.local`
- **Build Info**: `/BUILD_SUMMARY.md`

---

## ✅ Build Verification

```bash
npm run build  # Should complete with 0 errors
npm run dev    # Should start dev server
```

---

**Status**: Ready to deploy ✅  
**Last Updated**: 2026-05-20  
**Phase**: 0 (Foundation) Complete
