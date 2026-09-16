# PMO Dashboard — Handover Guide

_For someone with no software background. First-time setup takes about 1.5 hours; after that, making a change takes minutes. Written 16 September 2026._

You will end up with your own private copy of the app that you can run on your laptop, change by describing what you want to Claude, and publish to a web address for the team. Nothing you do can affect Diego's copy.

**You never have to type commands yourself.** Claude runs them for you. When this guide says "Ask Claude: …", type that sentence into the Claude chat.

---

## The five pieces (what each one is for)

| Piece | What it is | Cost |
|---|---|---|
| **GitHub** | Where the code lives online, with a full history of every change | Free |
| **Your laptop** | Where you run and test the app before publishing | — |
| **Claude Code** | The AI assistant that edits the code and runs commands for you | Claude Pro / Max / Team plan |
| **Neon** | The database that stores the uploaded plan data | Free |
| **Vercel** | The hosting service that puts the app on a web address for the team | Free |

---

## Before you start: Diego's to-do list

1. Add your GitHub username as a collaborator on **github.com/diegomedeirosilva/pmo-dashboard** (Settings → Collaborators → Add people).
2. Send you the latest readiness plan workbook (keep it in your Documents, not inside the project folder).

---

## Part 1 — Create your accounts (15 min)

1. **GitHub** — github.com → Sign up (free). Send Diego your username.
2. **Claude** — claude.ai. Claude Code is included in the **Pro, Max, Team and Enterprise** plans. It is **not** on the free plan.
3. **Neon** — neon.tech → Sign up (free, no card). Choose "Continue with GitHub" to keep it simple.
4. **Vercel** — vercel.com → Sign up (free "Hobby" plan). Choose "Continue with GitHub".
5. **Anthropic Console** (optional, only for the app's AI feature) — console.anthropic.com → Sign up → add a small amount of credit → **API keys** → **Create key**. Copy the key somewhere safe; it is shown only once. This is separate from your Claude subscription: the subscription pays for Claude Code, the API key pays per use for the Weekly Update generator inside the app. You can skip this and add it later.

---

## Part 2 — Install on your Windows laptop (15 min)

Both tools below need these two installed first. Accept every default in the installers.

1. **Git for Windows** — https://git-scm.com/downloads/win
2. **Node.js (LTS version)** — https://nodejs.org

Then pick **one** way to use Claude Code:

| | **Option A — VS Code + Claude Code extension** (what Diego uses) | **Option B — Claude Desktop app** (simpler screen) |
|---|---|---|
| Install | Install VS Code from code.visualstudio.com. Open it, click the Extensions icon on the left, search **"Claude Code"** (publisher: Anthropic), Install. | Download the Claude Desktop app from claude.ai/download. Install and sign in with your Claude account. |
| What you see | Files and code on the left, Claude chat in a side panel, a terminal at the bottom. Busier, but you can see everything. | One window with a **Code** tab. Chat first, code hidden unless you ask. |
| Getting the code | Built-in "Git: Clone" command (Part 3). | No clone button. You ask Claude to fetch the code (Part 3). |
| Where the app's messages appear | Terminal panel (Ctrl + `). | Terminal pane (Ctrl + `). |

Either way Claude runs the commands, asks your permission before doing anything risky, and explains what it did. If you are unsure, start with **Option B**. You can switch later; the code is the same.

---

## Part 3 — Get your own copy of the code (10 min)

**Step 1: Make your own repository on GitHub**

1. Sign in to GitHub and open **github.com/diegomedeirosilva/pmo-dashboard**.
2. Click the green **"Use this template"** button → **"Create a new repository"**.
3. Owner: you. Name: `pmo-dashboard`. Visibility: **Private**. Click **Create repository**.
4. Copy the address of your new repo from the browser bar. It looks like `https://github.com/YOUR-USERNAME/pmo-dashboard`.

**Step 2: Bring it to your laptop**

- **Option A (VS Code):** press Ctrl + Shift + P, type **Git: Clone**, press Enter, paste your repo address, choose a folder such as Documents, then click **Open** when asked. Open the Claude panel from the left-hand icon bar.
- **Option B (Claude Desktop):** create an empty folder, for example `Documents\PMO`. Open the Claude app → **Code** tab → choose that folder. Then ask Claude:

  > Clone https://github.com/YOUR-USERNAME/pmo-dashboard into this folder.

  When it finishes, use the Code tab to open the new `pmo-dashboard` folder inside `Documents\PMO`.

---

## Part 4 — Database and secrets (15 min)

**Step 1: Create the database**

1. neon.tech → **New project** → name it `pmo-dashboard` → Create.
2. Click **Connect** and copy the **connection string**. It starts with `postgresql://`.

**Step 2: Create the secrets file**

Ask Claude:

> Create a .env.local file in this project with placeholder values for DATABASE_URL, JWT_SECRET (generate a random one), SHARED_PASSWORD, AI_PROVIDER and ANTHROPIC_API_KEY. Then tell me where the file is.

Open `.env.local` in Notepad (or in VS Code) and paste in the real values:

- `DATABASE_URL` = the Neon connection string
- `SHARED_PASSWORD` = the password the team will log in with
- `ANTHROPIC_API_KEY` = your own key from console.anthropic.com (Part 1). If you are skipping AI for now, delete the two AI lines. Everything except the Weekly Update generator works without them.

Do not paste passwords or keys into the Claude chat. Put them in the file directly. This file stays on your laptop and is never sent to GitHub.

**Step 3: Create the tables**

Ask Claude:

> Install the dependencies and create the database tables using the .env.local file.

Claude runs `npm install` and `npm run db:push`. If it hits a problem it will tell you what to do.

---

## Part 5 — Run it (5 min)

Ask Claude:

> Start the app locally and give me the link.

Open **http://localhost:3000** in your browser. Log in with your shared password. On the welcome screen, upload the readiness plan workbook, check the preview and click **Confirm Import**. The dashboard, Gantt chart and other screens fill in automatically.

To stop the app later, ask Claude to stop it, or close the terminal.

---

## Part 6 — Making changes: the everyday workflow

This is the loop you will use for every change.

1. **Describe** the change in plain language. Be specific: which screen, what you see now, what you want instead.

   > On the Owner View page, sort the owners by number of overdue items, highest first.

   > The login page says "Project Crystal". Change it to "Project Atlas" everywhere it appears, including the executive report.

2. **Read Claude's summary.** It lists the files it changed. Ask "explain that in plain language" if anything is unclear.

3. **Test locally.** The app at localhost:3000 reloads by itself. Look at the screen. Try the feature.

4. **Refine.** Tell Claude what is not right:

   > Almost. The sort works but the count should be a red badge like on the dashboard.

   Repeat until it looks right. If it went badly:

   > Undo everything you changed in this request.

5. **Save to GitHub.** Ask Claude:

   > Commit these changes with a clear message and push them.

6. **Vercel publishes automatically** about two minutes after the push (once Part 7 is done). Check the live address.

**Habits that keep you out of trouble**

- One change per request. Small steps are easy to check and easy to undo.
- Always test on your laptop before you commit and push.
- Never paste passwords, keys or the connection string into the chat.
- Keep client workbooks and documents outside the project folder. The project ignores Excel, Word, PDF and PowerPoint files anyway, but keeping them elsewhere is safer.
- When Claude asks permission to run a command, read the one-line description. If it sounds like deleting or resetting something, ask why first.
- If the app shows an error, copy the error text and ask: "The app shows this error: … What is wrong and how do I fix it?"

---

## Part 7 — Put it online for the team (15 min)

1. vercel.com → **Add New** → **Project** → **Import** your `pmo-dashboard` GitHub repo.
2. Before clicking Deploy, open **Environment Variables** and add every line from your `.env.local` file, one by one (same names, same values). Optionally add `CRON_SECRET` with any random text so the daily trend snapshot is tagged correctly.
3. Click **Deploy**. After a minute Vercel shows your address, something like `pmo-dashboard-xyz.vercel.app`.
4. Share the address and the shared password with the team.

From now on, every push to GitHub updates the live site automatically. If a change alters the database structure, Claude will run `npm run db:push` on your laptop first; it points at the same Neon database the live site uses.

---

## If something goes wrong

| Problem | What to do |
|---|---|
| "Use this template" button is missing | Ask Diego to add you as a collaborator on the repo. |
| Claude says git or node is not found | Install Git for Windows and Node.js (Part 2), then restart VS Code or the Claude app. |
| Cannot log in to the app | Check `SHARED_PASSWORD` and `JWT_SECRET` in `.env.local` (locally) or in Vercel → Settings → Environment Variables (live site). |
| Upload is rejected | The workbook must contain a sheet named exactly `JV Readiness Plan`. |
| Weekly Update AI fails | `AI_PROVIDER` must match the key you set: `anthropic` with `ANTHROPIC_API_KEY`, or `openai` with `OPENAI_API_KEY`. |
| Live site is out of date | Open vercel.com and check the latest deployment succeeded. If it failed, paste the error to Claude. |
| Anything else | Ask Claude. It can read the whole project and explain. |

---

## Words you will see

- **Repository (repo)** — the project folder as stored on GitHub, with its full history.
- **Clone** — download a repo to your laptop.
- **Commit** — save a named checkpoint of your changes.
- **Push** — send your commits from your laptop to GitHub.
- **Deploy** — publish the app to a web address (Vercel does this for you).
- **Terminal** — the text window where commands run. Claude uses it; you only read it.
- **localhost:3000** — the app running on your own laptop, visible only to you.
- **Environment variable** — a named secret, such as a password, kept in `.env.local` or in Vercel settings.
- **Template** — a GitHub repo you can copy with one click to make your own.
