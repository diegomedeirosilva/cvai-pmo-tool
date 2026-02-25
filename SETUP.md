# PMO Dashboard — Setup Guide

## Step 1: Create a free Neon database

1. Go to **[neon.tech](https://neon.tech)** and sign up (free, no credit card)
2. Create a new project — name it anything (e.g. "pmo-dashboard")
3. In the dashboard, click **"Connect"** and copy the **Connection string** — it looks like:
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

## Step 2: Configure your .env.local

Open the file `.env.local` in this folder and fill in:

```
DATABASE_URL=postgresql://username:password@ep-xxx.aws.neon.tech/neondb?sslmode=require

JWT_SECRET=any-long-random-string-here-at-least-32-chars

SHARED_PASSWORD=your-team-password

# Optional — for AI features
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

## Step 3: Create the database tables

Run this command in the terminal:
```
npm run db:push
```

If that fails, copy the contents of `drizzle/0000_init.sql` and run it in the Neon SQL console.

## Step 4: Start the app

```
npm run dev
```

Open **http://localhost:3000** in your browser.

## Step 5: Upload your workplan

1. Log in with your SHARED_PASSWORD
2. You'll see a file upload screen — drop in `Maaden - JV Readiness Plan v6.xlsx`
3. Review the preview (116 items, 10 workstreams) and confirm import
4. The dashboard, Gantt, risks, etc. all populate automatically

## Step 6: Deploy to Vercel (optional, for team access)

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Follow prompts (link to your Vercel account)
4. Add environment variables in Vercel dashboard (Settings → Environment Variables)
5. Your team can access the URL Vercel gives you

---

## What's built (Phase 1)

| Feature | Status |
|---|---|
| Excel upload + parsing (with formula detection) | ✅ |
| Executive Dashboard (countdown, health, metrics, AI summary) | ✅ |
| Gantt Chart (SVG, dependencies, grouping, zoom) | ✅ |
| Risk Register (rule-based auto-detection) | ✅ |
| Owner Workload View | ✅ |
| Workstream Deep-Dive + inline editing | ✅ |
| Excel round-trip export (with formulas) | ✅ |
| Excel analytics export (4 sheets) | ✅ |
| AI narrative summary (Anthropic/OpenAI) | ✅ |
| Shared password auth | ✅ |

## Phase 2 (coming next)
- Meeting notes AI analysis
- Upload history + diff view
- PDF / PowerPoint export
- Trend tracking
