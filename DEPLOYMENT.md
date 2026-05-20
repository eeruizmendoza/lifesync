# LifeSync Deployment Guide

## ✅ Current Status

**Database**: Ready  
**Application**: Built & tested  
**Authentication**: Configured  
**Encryption**: Enabled  

---

## 🚀 Deploy to Vercel

### Step 1: Get Twilio Credentials

If you don't have a Twilio account:
1. Visit [twilio.com](https://www.twilio.com)
2. Sign up for a free account
3. Verify your email
4. Get your credentials from the Console:
   - **Account SID** (starts with `AC`)
   - **Auth Token**
   - **Phone Number** (from Phone Numbers section)

### Step 2: Push to GitHub

```bash
cd /Users/eduardoruiz/Desktop/lifesync
git init
git add .
git commit -m "Initial LifeSync setup with database schema"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lifesync.git
git push -u origin main
```

### Step 3: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import the GitHub repository
4. Set environment variables:
   ```
   DATABASE_URL: postgresql://neondb_owner:npg_QJ14DAZo5hYx@ep-square-hill-anl7eq8v-pooler.c-6.us-east-1.aws.neon.tech/lifesync?sslmode=require&channel_binding=require
   TWILIO_ACCOUNT_SID: AC...
   TWILIO_AUTH_TOKEN: (your token)
   TWILIO_PHONE_NUMBER: +1...
   JWT_SECRET: xVAf+OQGPGOJfjZ4uPr0NsovjpVGS32qs5XntTbJJNU=
   NEXT_PUBLIC_APP_URL: (your-vercel-domain.vercel.app)
   ```
5. Click "Deploy"

---

## 🧪 Local Testing

Before deploying, test locally:

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000`:
1. Click "Sign In"
2. Enter your phone number
3. Check SMS for code
4. Enter code to complete login

---

## 📊 Database Connection

**Connection Details:**
- Host: `ep-square-hill-anl7eq8v-pooler.c-6.us-east-1.aws.neon.tech`
- Database: `lifesync`
- User: `neondb_owner`
- Port: `5432`
- SSL: Required

**Tables Created:** 25 (users, posts, messages, calls, contacts, connections, etc.)  
**Indexes:** 40+ for query optimization  
**Encryption:** All sensitive fields AES-256-GCM encrypted  

---

## 🔒 Security Notes

- ✅ JWT tokens stored in HTTP-only cookies
- ✅ All API endpoints require authentication
- ✅ Database credentials secured in environment variables
- ✅ Passwords hashed with bcrypt
- ✅ SMS codes hashed and time-limited
- ✅ No sensitive data in logs

---

## 📱 Features Ready

- **Authentication**: SMS/phone-based login
- **Encryption**: End-to-end encryption on all messages
- **Social Feed**: Create posts, like, comment, react
- **Communications**: Unified messaging inbox (Gmail, SMS, WhatsApp, calls)
- **Contact Sync**: Phone contact discovery & connection
- **Privacy**: Private by default, soft-delete retention

---

## 💡 Next Development Phases

**Phase 1 (Complete)**: Database schema & authentication  
**Phase 2**: Social feed features (posts, likes, comments)  
**Phase 3**: Communications aggregation (Gmail, SMS, WhatsApp sync)  
**Phase 4**: Advanced features (AI search, analytics, discovery)  

