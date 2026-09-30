# 🚀 How to Host the Peace-Watch Backend on the Internet — FREE

**Total cost: $0 / month. No credit card required.**

This guide walks you through hosting the Peace-Watch **backend** (the
FastAPI + Python API) on the internet so that **anyone** can reach it, from
anywhere, 24/7 — not just on your computer.

If you follow every step exactly, you will end up with a working live URL that
looks like this:

```
https://peace-watch-backend.onrender.com
```

...and you can open `https://peace-watch-backend.onrender.com/docs` to see the
live API documentation.

---

## 👉 What we are building (explained simply)

You have 2 computers working together:

```
 YOUR COMPUTER                    THE CLOUD (free)
 ┌──────────────┐    push code    ┌──────────────────────────────┐
 │  Your code   │ ──────────────► │  GitHub (stores your code)   │
 │  (this repo) │                 └──────────────┬───────────────┘
 └──────────────┘                                │ Render reads the code
                                                 ▼
                                        ┌────────────────────────┐
                                        │  RENDER.COM           │
                                        │  runs your backend    │
                                        │  (a free "Web Service")│
                                        └───────────┬────────────┘
                                                    │ stores data in
                                                    ▼
                                        ┌────────────────────────┐
                                        │  NEON (free Postgres)  │
                                        │  your database lives   │
                                        │  here safely           │
                                        └────────────────────────┘
```

Three free services are used:

| Service | What it does | Why this one |
|---|---|---|
| **GitHub** | Stores a copy of your code in the cloud | Render needs a code source it can read from |
| **Render.com** | Runs your backend (installs packages, starts the server) | Easiest free host for Python/FastAPI, great beginner docs |
| **Neon** | A free PostgreSQL database in the cloud | Your data (reports, clusters, alerts) must survive restarts. The free Render service **loses its files on every restart**, so the database has to live somewhere separate |

> ⚠️ **Why not keep the built-in SQLite?** Your project defaults to a local
> `peacewatch.db` file. On free hosting that file is **deleted every time the
> app restarts or redeploys**. That's why we add a separate free PostgreSQL
> database (Neon) — your data then survives forever.

---

## 📋 What you need before you start

- A computer with **Windows** (the commands below are for PowerShell).
- **VS Code** (you already have the project open in it).
- A **GitHub account** (free) — sign up at https://github.com if you don't have one.
- About **20–30 minutes** the first time (mostly waiting for installs).

---

# STEP 0 — Install Git (one time only)

Git is the tool that sends your code to GitHub. Your computer does not have it
yet, so we install it first.

1. Open your web browser and go to: **https://git-scm.com/download/win**
2. Click the big **64-bit Git for Windows Setup** download link.
3. Open the downloaded file and click **Next** through the installer.
   **Keep every default option.** (Do not change anything.)
4. Click **Install**, then **Finish**.
5. Open **PowerShell** (click the Windows Start menu, type `powershell`, press Enter), and type:

   ```powershell
   git --version
   ```

   You should see something like `git version 2.4x.x`. If you see that, Git is ready.

---

# STEP 1 — Protect your secrets (read, don't skip!)

Your `backend\.env` file contains your **real API keys** (OpenRouter, NVIDIA).
These keys are like passwords. If they get uploaded to GitHub, anyone could
read them and use them (and possibly spend your free AI credits).

A `.gitignore` file tells Git "never upload these files". I have already
created one for you at the project root: `C:\Users\HP\Desktop\Comunity-Watch\.gitignore`.

It excludes (among other things):

```
backend/.env          ← your secret API keys
backend/peacewatch.db ← your local database (not needed in the cloud)
.venv/                ← your Python environment (huge, not needed)
frontend/node_modules ← your npm packages (huge, not needed)
frontend/dist         ← built files (regenerated on each build)
```

✅ **Nothing to do here — just know this exists.**

> 💡 **Rule of thumb:** if a file has `KEY`, `SECRET`, `PASSWORD` or `TOKEN`
> in it, it belongs in `.gitignore`, not on GitHub.

---

# STEP 2 — Put the code on GitHub

### 2.1 Create an empty repository on GitHub

1. Go to **https://github.com** and sign in.
2. Click the **`+`** icon in the top-right corner → **New repository**.
3. **Repository name:** `peace-watch` (or anything you like).
4. **Privacy:** Public or Private — both work. (Private is fine; Render has access because you will authorize it.)
5. ⚠️ **Do NOT tick** any of these boxes:
   - ❌ "Add a README file"
   - ❌ "Add .gitignore"
   - ❌ "Choose a license"
   (You already have your own.)
6. Click **Create repository**.

GitHub will show you a page with commands "…or push an existing repository
from the command line". **Leave that page open — you need it in a second.**

### 2.2 Open PowerShell inside your project folder

1. In **VS Code**, open your project folder if it's not open already
   (File → Open Folder → `C:\Users\HP\Desktop\Comunity-Watch`).
2. Click **Terminal** in the top menu → **New Terminal**.
3. Make sure the dropdown in the terminal window says **PowerShell**
   (if it says `cmd` or anything else, click it and pick **PowerShell**).

### 2.3 Run these commands one by one

Copy each line, paste it into the terminal, press **Enter**, and wait for it to finish before running the next one:

```powershell
git init
```

```powershell
git add .
```

> ⏳ The first `git add .` can take a little while because you have a lot of
> local files. That's normal.

```powershell
git commit -m "Initial commit"
```

```powershell
git branch -M main
```

Now replace `YOUR_USERNAME` below with your actual GitHub username, then run:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/peace-watch.git
```

Then push:

```powershell
git push -u origin main
```

### 2.4 What will happen

- The first time you push, a login window may appear. It's GitHub asking you
  to sign in to allow the push. Click through it (you can use your browser).
- When it finishes, refresh your `https://github.com/YOUR_USERNAME/peace-watch`
  page — you should now see your project's files there. 🎉

> **Plain-English translation of those commands:**
> `git init` = "make this folder a Git project";
> `git add .` = "stage all files (except gitignored ones)";
> `git commit` = "save a snapshot with a message";
> `git remote add origin` = "remember where GitHub lives";
> `git push` = "upload the snapshot to GitHub".

---

# STEP 3 — Create the free database (Neon)

Now we create a free PostgreSQL database in the cloud. Remember: the free
Render service can't keep your data between restarts, but this database can.

### 3.1 Create an account

1. Go to **https://neon.tech**.
2. Click **Sign up** (up top). Sign in with **GitHub**, **Google**, or your email.
3. Choose the **Free plan** if asked.

### 3.2 Create a project

1. On the project page, click **New Project** (or **Create a project**).
2. **Name:** `peace-watch`
3. **Region:** choose the one closest to you (e.g. US East / EU West). Any region works for a demo.
4. Click **Create project**.
5. Wait about a minute while Neon prepares your database.

### 3.3 Copy the connection string

1. After the project is created, Neon shows a **"Connect to your database"**
   screen with a **connection string** (a long text that starts with
   `postgresql://`).
2. Click the **Copy** button next to it.
3. Paste it into an empty Notepad window — you need it in Step 4.
   It looks similar to this (yours will be different):

   ```
   postgresql://neondb_owner:abcdef123456@ep-red-ant-987654.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

   > If you accidentally close that screen: on the Neon dashboard, click your
   > project → click **Connect** → copy the **Connection string**. That's the same thing.

### 3.4 Convert the string for our app (⚠️ important)

Our backend uses the **asyncpg** driver, so the string needs two tiny changes:

1. Replace the beginning `postgresql://` with `postgresql+asyncpg://`
2. Replace the end `sslmode=require` with `ssl=require`

Example:

| | |
|---|---|
| **Before** | `postgresql://neondb_owner:abcdef123456@ep-red-ant-987654.us-east-1.aws.neon.tech/neondb?sslmode=require` |
| **After**  | `postgresql+asyncpg://neondb_owner:abcdef123456@ep-red-ant-987654.us-east-1.aws.neon.tech/neondb?ssl=require` |

Only the **first word** and the **last word** change. Save the converted
("After") string in your Notepad — we paste it into Render in Step 4.

---

# STEP 4 — Create the free backend on Render

### 4.1 Create an account

1. Go to **https://render.com**.
2. Click **Get Started** → **Sign up with GitHub** (easiest — it reuses your GitHub login).
3. Verify your email if they ask.
4. ⚠️ They may show you a "Select a plan" screen — the **Free** plan has no
   cost and **no credit card is required**. Stay on Free.

### 4.2 Create a **Web Service**

1. On the Render dashboard, click the **New +** button (top-right) → **Web Service**.
2. If asked, **connect your GitHub account** to Render (click "Connect account"
   and approve). Render now has permission to read your `peace-watch` repository.
3. Find your **`peace-watch`** repository in the list and click **Connect**.

### 4.3 Fill in the form exactly like this

| Field | What to type / choose |
|---|---|
| **Name** | `peace-watch-backend` |
| **Region** | The one nearest you (e.g. `Frankfurt (EU Central)` or `Oregon (US West)`) |
| **Branch** | `main` |
| **Root Directory** | `backend` ⚠️ **very important** — your Python code is in the `backend` folder |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` |

> 🔎 **Why these values?**
> - **Root Directory `backend`** — Render looks for `requirements.txt` there.
> - **Build Command** — installs all Python packages the app needs.
> - **Start Command** — launches the app. `$PORT` is a port number that Render
>   provides automatically; the app must listen on it. (`app.main` is the file
>   `backend/app/main.py`, and `app` is the FastAPI object inside it.)

### 4.4 Add the environment variables

Click the **Advanced** button to expand the extra settings, then:

**a) Health Check Path** (only if the field is available on your plan):

```
/api/health
```

**b) Environment Variables** — click **Add Environment Variable** for each row:

| Key | Value |
|---|---|
| `DATABASE_URL` | **The converted "After" string from Step 3.4** (starts with `postgresql+asyncpg://`) |
| `CORS_ALLOW_ALL` | `true` |
| `OPENROUTER_API_KEY` | *(optional — your key from https://openrouter.ai/keys, if you have one)* |
| `NVIDIA_API_KEY` | *(optional — your key if you have one)* |

> 🔎 **What each one does:**
> - `DATABASE_URL` tells the app which cloud database to use. **Required** —
>   without it the app falls back to SQLite (which gets erased on every restart).
> - `CORS_ALLOW_ALL=true` lets **any** website (or your local dashboard) call
>   your API. Perfect for a demo. For strict production locking, set it to
>   `false` and provide `CORS_ORIGINS` with your exact frontend URL instead.
> - The API keys turn on the **AI incident extraction**. Without keys, the app
>   still works in "degraded" mode: reports are saved but no AI summary is made.

### 4.5 Deploy!

1. Scroll to the bottom and click **Create Web Service**.
2. A deployment screen appears. Watch the status lights:
   - 🔴 **Building** (installing packages — first time takes **5–10 minutes**)
   - 🟡 **Provisioning / Updating**
   - 🟢 **Live** — after a final short wait, your service is up!
3. Once it is **Live**, Render shows a public URL at the top, like:

   ```
   https://peace-watch-backend.onrender.com
   ```

### 4.6 Test your live backend 🎉

Open each of these addresses in your browser (replace with **your** URL):

1. **Health check:**
   `https://peace-watch-backend.onrender.com/api/health`
   → You should see JSON:
   ```json
   {"status":"ok","app":"Peace-Watch API","version":"0.2.0"}
   ```

2. **Live data (demo reports already seeded):**
   `https://peace-watch-backend.onrender.com/api/overview`
   → JSON containing reports, clusters, alerts.

3. **Interactive API documentation (your new best friend):**
   `https://peace-watch-backend.onrender.com/docs`
   → A blue Swagger page. Click any endpoint → **Try it out** → **Execute** to call your live API.

🎉 **That's it. Your backend is now hosted on the internet for free!**

---

# STEP 5 — (Optional) Point your dashboard at the hosted backend

Now that the backend is live, you can run the existing frontend locally and
connect it to the hosted API.

1. In the `frontend` folder of your project, open the file **`.env`**.
2. Change the line:

   ```
   VITE_API_BASE=http://127.0.0.1:8001/api
   ```

   to (use **your** Render URL):

   ```
   VITE_API_BASE=https://peace-watch-backend.onrender.com/api
   ```

   > ⚠️ No `http://127.0.0.1` anymore! The API now lives on the internet.

3. Start the dashboard as usual:

   ```powershell
   cd frontend
   npm run dev
   ```

4. Open the local dashboard (usually http://localhost:5173). It now reads and
   writes data **from the cloud backend**. Try adding a report — then open
   `/docs` on Render and see it appear. 🪄

### Bonus: put the dashboard online too (free, 2 minutes)

1. In PowerShell:

   ```powershell
   cd frontend
   npm run build
   ```

   This creates the `frontend\dist` folder (ready-to-serve website files).

2. Go to **https://app.netlify.com** → sign up free → **Add new site** →
   **Deploy manually** → drag and drop your **`frontend\dist`** folder onto the page.
3. Netlify gives you a URL like `https://peace-watch-dashboard.netlify.app`.

> Since `CORS_ALLOW_ALL=true`, the hosted dashboard will talk to the hosted
> backend with no extra setup. 🤝

---

# STEP 6 — Important things to know about the free tier

### 🥶 The free backend "sleeps" — first visit can be slow
Render free services **go to sleep after 15 minutes with no visitors**. When
someone visits after a nap, Render has to wake the app up. The **first request
after sleeping takes ~30–60 seconds** — after that, everything is fast again.

- Don't panic if the dashboard shows "Cannot reach the API" the first time —
  wait ~1 minute and refresh.
- The health-check URL (`.../api/health`) is a good "wake it up" warm-up call.

### 🎙️ Speech-to-text (voice reports) will NOT run on the free plan
The voice feature uses a Whisper AI model that needs **more than 512 MB of
RAM**. Render's free instance has exactly **512 MB** — so **voice uploads will
fail or crash the app** on the free tier.

- Everything else (text reports, clusters, alerts, dashboard) works perfectly.
- If you want voice later, upgrade the service to a paid instance with ≥ 2 GB
  of RAM, or just rely on text reports on the free tier.

### 🗃️ Your database has limits too (Neon free plan)
- **0.5 GB storage** — plenty for a demo; if it fills up, inserts stop working
  until you free space or upgrade (your data is never deleted automatically).
- **~100 compute-hours/month** — the database counts time only while it is
  actively used; for a demo dashboard this is far more than enough.
- Neon's database **sleeps after ~5 min idle** and wakes automatically when
  your app talks to it (adds ~2–3 seconds to the first request after a nap).
- ✅ No credit card needed, and exceeding limits never deletes your data.

### 🧯 Why we did NOT use Render's own free PostgreSQL
Render also offers a free PostgreSQL, but it has a big catch: **it expires
30 days after creation and is then permanently deleted.** Neon's free database
does not expire. That's why we use Neon.

### 🔄 Restarts and redeploys
- Render may restart the free web service at any time — with the Neon database,
  **your data survives every restart**. 🤗
- On every boot the app checks the database, creates any missing tables, and
  seeds the demo data **only if the database is empty**. So your real data is
  never overwritten.

---

# STEP 7 — Updating the backend later (git push = auto-deploy)

Whenever you change the backend code and want it live:

```powershell
git add .
git commit -m "describe what you changed"
git push
```

Render **automatically notices the new commit and deploys it** (takes ~5–10 min).

- Want to force it? Go to your service in Render → **Manual Deploy** →
  **Deploy latest commit**.
- Stuck build? **Manual Deploy** → **Clear build cache & deploy**.

### Changing environment variables (API keys, etc.)

1. In Render, open your **peace-watch-backend** service.
2. Click the **Environment** tab.
3. Edit/add variables → click **Save Changes**.
4. Render redeploys automatically with the new values.

> ⚠️ **Editing `backend\.env` on your computer does NOT change the website.**
> `backend\.env` is local-only. The website reads the variables you set in the
> Render **Environment** tab.

### Reading error logs

1. In Render, open your service.
2. Click the **Logs** tab.
3. Live logs appear; filter them, or click **Pause/Resume** to freeze the view.
   Python exceptions and `Traceback`s show up here whenever something fails.

---

# 🚑 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Cannot reach the API" in the dashboard, or `502` on first open | The free service was asleep | Wait 30–60 s and refresh. Or open `.../api/health` once first |
| Build fails during `pip install` | Temporary network issue, or full build cache | "Manual Deploy" → "Clear build cache & deploy" (retry 1–2 times) |
| `503` right after deploy | App still booting (creating tables, seeding) | Wait 1–2 minutes and refresh |
| `/api/health` works but the dashboard can't read data | CORS | Make sure `CORS_ALLOW_ALL=true` in the Environment tab, save, wait for redeploy |
| Voice/audio upload fails | Whisper can't fit in 512 MB RAM on the free instance | Use text reports on free tier, or upgrade the instance |
| I changed `backend\.env` but nothing happened online | Env vars are set in the Render dashboard, not the local `.env` | Environment tab → edit → Save Changes |
| `faster-whisper` install is super slow | It's a big package; first build downloads it | Let it finish; subsequent builds use the cache (5–10 min is normal) |
| Database connection errors at startup | Wrong/missing `ssl=require` conversion | Re-check Step 3.4 — URL must start `postgresql+asyncpg://` and end `ssl=require` |
| `pip install` can't find a package | Render picked an old Python runtime | In the service settings, set the Runtime to a recent Python 3 version (e.g. 3.12 or 3.13) |

---

# 💰 Cost summary

| Item | What it is | Cost |
|---|---|---|
| GitHub repository | Stores your code (private is fine) | $0 |
| Render **Web Service** (Free instance, 0.1 CPU / 512 MB) | Runs your FastAPI backend | $0 |
| Neon **PostgreSQL** (Free plan: 0.5 GB, ~100 compute-hours/month) | Your persistent database | $0 |
| **Total** | | **$0 / month** 🎉 |

### What you would pay if you outgrow the free tier (for reference)

| Need | Option |
|---|---|
| Voice / speech-to-text | Render paid instance with ≥ 2 GB RAM |
| More database space / always-on DB | A paid Postgres plan (Neon "Launch" starts around $19/month) |
| Site that never sleeps | Render paid "Starter" web service (~$7/month) |

---

# ✅ Checklist — did you do everything?

- [ ] STEP 0 — Git installed (`git --version` works)
- [ ] STEP 1 — `.gitignore` exists at the project root (already provided)
- [ ] STEP 2 — Code pushed to GitHub (`github.com/YOUR_USERNAME/peace-watch`)
- [ ] STEP 3 — Neon database created, connection string converted to `postgresql+asyncpg://...?ssl=require`
- [ ] STEP 4 — Web Service created with Root Directory `backend`, correct Start Command, `DATABASE_URL` set, status **Live**
- [ ] STEP 4.6 — `.../api/health` returns `{"status":"ok",...}`
- [ ] STEP 5 (optional) — Frontend `.env` points to the hosted URL
- [ ] STEP 7 — You know how to update & redeploy: `git push`

---

*Your Peace-Watch backend is now a real internet citizen. 🕊️*