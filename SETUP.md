# PMO Dashboard — Setup Guide

_Last refreshed: 16 September 2026. Reflects the app as it stands today (Risk Register, PDF/PPTX exports and the upload diff view have been removed)._

The app is a Next.js site backed by a free Neon PostgreSQL database. It runs on your laptop for day-to-day work and is also deployed on Vercel so the team can reach it from a URL.

---

## Before you start

- **Node.js** installed (any recent LTS version).
- The project folder (`cvai-pmo-tool`) cloned from GitHub.
- From inside that folder, install the dependencies once:
  ```
  npm install
  ```

---

## Step 1: Create a free Neon database

1. Go to **[neon.tech](https://neon.tech)** and sign up (free, no credit card).
2. Create a new project — name it anything (e.g. `pmo-dashboard`).
3. In the Neon dashboard, click **Connect** and copy the **connection string**. It looks like:
   ```
   postgresql://username:password@ep-xxx.aws.neon.tech/neondb?sslmode=require
   ```

---

## Step 2: Configure `.env.local`

Create (or open) the file `.env.local` in the project folder. It is never committed to GitHub. Fill in:

```
# Database — from Neon (Step 1)
DATABASE_URL=postgresql://username:password@ep-xxx.aws.neon.tech/neondb?sslmode=require

# Auth — a long random string; generate one with the command below
JWT_SECRET=paste-generated-value-here
SHARED_PASSWORD=the-one-password-the-team-uses

# AI (optional — only the Weekly Update generator needs it)
AI_PROVIDER=anthropic          # or: openai
ANTHROPIC_API_KEY=sk-ant-...   # if AI_PROVIDER=anthropic
# ANTHROPIC_MODEL=...          # optional model override
# OPENAI_API_KEY=sk-...        # if AI_PROVIDER=openai

# Vercel cron (optional — see Step 6)
# CRON_SECRET=another-random-string
```

Generate the random secret with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Key | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon connection string |
| `JWT_SECRET` | Yes | Signs the login cookie |
| `SHARED_PASSWORD` | Yes | The single password everyone logs in with |
| `AI_PROVIDER` | Optional | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Optional | Key for the chosen provider |
| `ANTHROPIC_MODEL` | Optional | Override the default Anthropic model |
| `CRON_SECRET` | Optional | Lets the app recognise Vercel's daily snapshot call |

---

## Step 3: Create the database tables

```
npm run db:push
```

If that fails, copy the contents of `drizzle/0000_init.sql` and run it in the Neon **SQL Editor**.

Run `npm run db:push` again whenever a code update changes the database structure (it is safe to re-run).

---

## Step 4: Start the app locally

```
npm run dev
```

Open **http://localhost:3000** and log in with your `SHARED_PASSWORD`.

---

## Step 5: Upload the readiness plan

1. On first login you will see the **Welcome** screen — drop in the latest readiness plan workbook (currently `20260623 Crystal JV - Readiness Plan v14.xlsx`).
2. The workbook must contain a sheet named **`JV Readiness Plan`**. The parser detects the column layout automatically (v6 through v14 layouts are supported, including the "Maaden Owner" rename and the shifted end-date column).
3. Check the preview, then **Confirm Import**. Dependencies are read from the Excel formulas (e.g. `=I5`), never guessed from dates.
4. Every later version is uploaded from **Settings → Upload new version** (preview, then confirm). Each upload is kept in the upload history and adds a point to the dashboard trend chart. Deleting an upload from Settings removes only that trend point, not the current data.

Client workbooks and documents are git-ignored (`*.xlsx`, `*.docx`, `*.pdf`, `*.pptx`), so they stay off GitHub.

---

## Step 6: Deploy to Vercel (team access)

Vercel links to your GitHub repo through its **GitHub integration**, so every push to `main` deploys automatically. To set it up:

1. Go to **vercel.com → Add New → Project** and import your repo (e.g. `diegomedeirosilva/pmo-dashboard`) from GitHub.
2. Before deploying, open **Settings → Environment Variables** and add every key from Step 2 (same values as your `.env.local`, or a different `SHARED_PASSWORD` for the team if you prefer).
3. Deploy. Vercel gives you the team URL.

**Daily snapshots.** `vercel.json` schedules a call to `/api/snapshots` every day at 06:00 UTC, which records a trend-chart data point. Set `CRON_SECRET` in Vercel's environment variables so those automatic snapshots are tagged as "cron" rather than "manual". Daily crons are supported on Vercel's free (Hobby) plan.

**Updating the live site.** Commit and push to `main`; Vercel rebuilds in a minute or two. If you changed the database structure, run `npm run db:push` locally first (it points at the same Neon database).

---

## Step 7: Keep the code on GitHub

Repository: **https://github.com/diegomedeirosilva/pmo-dashboard** (branch `main`) — the clean copy created 16 September 2026 for handover. The original `cvai-pmo-tool` repo stays linked to Diego's own Vercel deployment; its early history contains client workbooks, so do not copy from it.

Handing the app to a new person? Follow **HANDOVER.md** instead — it walks through GitHub, Neon, Vercel and Claude Code from zero.

After each chunk of work:
```
git add -A
git commit -m "Short description of the change"
git push
```

Never commit `.env.local`, the `uploads/` folder, the `demo/` folder, or any client workbook or document — `.gitignore` already blocks them.

---

## What's in the app

| Screen | What it does |
|---|---|
| **Dashboard** | Day-1 countdown (projected from the plan's latest end date, measured against the Original Target), key metrics, status trend chart, workstream health table with expandable rows, upcoming milestones, overdue items. Add or edit action items inline; propagate a delay through dependent items. |
| **Weekly Update** | Per-deliverable status narrative generated by AI from the current plan (McKinsey-style bullets), editable before sending; health dot per section. |
| **Gantt Chart** | SVG timeline with dependency arrows, drag-and-drop rescheduling, baseline slip, status-coloured bars, month/collapsed default view. |
| **Critical Path** | Longest dependency chain to Day-1. |
| **Owner View** | Workload per owner with items due in 7 / 14 / 30 days (overdue included). |
| **Reports & Exports** | Executive HTML board report (interactive on screen, exportable as a single shareable file) and round-trip Excel export (same layout and formulas as the original, re-importable). |
| **Settings** | Original Day-1 target date, upload a new plan version, upload history with delete, set schedule baseline. |

Statuses are computed automatically from dates and completion (Closed, On-track, At-risk, Delayed, Not Started). Group progress bars show the average completion %.

**AI** is used only by the Weekly Update generator. Without an API key the rest of the app works normally and generation shows an error.

---

## Removed features (do not look for these)

- Risk Register — deleted July 2026. The `risks` table may still exist in Neon; it is harmless, but you can drop it in the SQL Editor with `DROP TABLE IF EXISTS risks;`.
- PDF / PowerPoint / analytics exports — deleted July 2026. Exports are the Executive HTML report and the round-trip Excel only.
- Upload diff view and meeting-notes page — deleted July 2026.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run db:push` fails | Run `drizzle/0000_init.sql` in the Neon SQL Editor instead. |
| Cannot log in | Check `SHARED_PASSWORD` and `JWT_SECRET` are set (locally in `.env.local`, on Vercel in Environment Variables for Production). |
| Weekly Update AI generation fails | Check `AI_PROVIDER` matches the key you set (`anthropic` ↔ `ANTHROPIC_API_KEY`, `openai` ↔ `OPENAI_API_KEY`). |
| Upload rejected | Make sure the workbook has a sheet named exactly `JV Readiness Plan`. |
| Dashboard shows old numbers | Hard-refresh the page (Ctrl+F5). Database reads are already uncached in code. |
| Vercel site out of date | Check the push reached `main` and the Vercel deployment succeeded in the Vercel dashboard. |
