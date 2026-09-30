# 🚀 How to Host the Peace-Watch Backend on the Internet — FREE (Quick Version)

**Total cost: $0 / month. No credit card. No database setup needed.**

This short guide gets your backend online in the simplest possible way. It uses
the project's built-in **SQLite** database — perfect for testing. (You can add
a real cloud database later when you're ready for production — see the note in
Step 5.)

---

## ✅ Already done for you

| Task | Status |
|---|---|
| Git installed | ✅ Done |
| Secrets protected (`.gitignore`) | ✅ Done |
| Code pushed to GitHub | ✅ Done — https://github.com/Emmanuel-Praise/peace-watch |
| Database | ✅ None needed — app uses SQLite automatically |

So you only have **2 things left**: create the free account on Render, and
deploy. Let's go. ⏱️ (~15 minutes, mostly waiting)

> ⚠️ **One thing to know about SQLite for now:** the free Render service
> **erases its files every time it redeploys or restarts**, so the SQLite data
> (reports you add) will reset. That's perfectly normal and fine for testing.
> You'll see how to switch to a permanent database later in **Step 5**.

---

# STEP 1 — Deploy the backend on Render (free)

Render reads your code from GitHub, installs its packages, and runs it on the
internet. It's the platform we'll use.

### 1.1 Create your free account

1. Go to **https://render.com**
2. Click **Get Started** → **Sign up with GitHub** (easiest).
3. Verify your email if asked.
4. On the plan screen, stay on **Free** — no credit card required.

### 1.2 Create a **Web Service**

1. On the Render dashboard, click **New +** (top right) → **Web Service**.
2. If asked, **connect your GitHub account** (click "Connect account" and approve).
3. Find **`peace-watch`** in the repo list → click **Connect**.

### 1.3 Fill the form exactly like this

| Field | What to type / choose |
|---|---|
| **Name** | `peace-watch-backend` |
| **Region** | Nearest to you (e.g. `Frankfurt (EU Central)` or `Oregon (US West)`) |
| **Branch** | `main` |
| **Root Directory** | `backend` ⚠️ **important** — your Python code lives there |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` |

### 1.4 Environment variables (optional)

Click **Advanced** to expand extra settings.

- **Health Check Path:** type `/api/health` (if the field is shown).

- **Environment Variables** — click **Add Environment Variable** for each one:

  | Key | Value | Needed? |
  |---|---|---|
  | `CORS_ALLOW_ALL` | `true` | Yes — lets your dashboard call the API |
  | `OPENROUTER_API_KEY` | your key from https://openrouter.ai/keys | No — skip if you don't have one |
  | `NVIDIA_API_KEY` | your key | No — skip if you don't have one |

  Without the AI keys the API still works perfectly — reports are just saved
  without an automatic AI summary. **No database settings needed at all** —
  the app uses SQLite automatically.

### 1.5 Deploy 🚀

1. Click **Create Web Service**.
2. Wait — watch the status lights:
   - 🔴 **Building** (first time: **5–10 minutes**, this is normal)
   - 🟡 Setup
   - 🟢 **Live**
3. When **Live**, your URL is shown at the top, like:
   `https://peace-watch-backend.onrender.com`

---

# STEP 2 — Test your live API 🎉

Open these in your browser (use **your** URL):

1. **Health check:**
   `https://peace-watch-backend.onrender.com/api/health`
   → `{"status":"ok","app":"Peace-Watch API","version":"0.2.0"}`

2. **Live demo data (seeded automatically on first start):**
   `https://peace-watch-backend.onrender.com/api/overview`

3. **Interactive API docs:**
   `https://peace-watch-backend.onrender.com/docs`
   → Swagger page; click an endpoint → **Try it out** → **Execute**.

✅ **Done! Your backend is live on the internet for free!**

---

# STEP 3 — (Optional) Point your dashboard at the hosted backend

1. Open `frontend\.env` and change the API address to **your** URL:

   ```
   VITE_API_BASE=https://peace-watch-backend.onrender.com/api
   ```

2. Restart the dashboard:

   ```powershell
   cd frontend
   npm run dev
   ```

3. Open http://localhost:5173 — the dashboard now reads and writes **from the
   cloud backend**. Try adding a report, then check `/docs` on Render. 🪄

Want the dashboard online too? Build it and drag-drop onto **Netlify** (free):

```powershell
cd frontend
npm run build
```

Then go to https://app.netlify.com → **Add new site** → **Deploy manually** →
drop the `frontend\dist` folder onto the page.

---

# STEP 4 — When you change the code later

Push to GitHub and Render **redeploys automatically** (~5–10 min):

```powershell
git add .
git commit -m "describe your change"
git push
```

- Change API keys/settings? Render → your service → **Environment** tab →
  edit → **Save Changes** (this redeploys).
- Check errors? Render → your service → **Logs** tab.

---

# STEP 5 — Good to know (free tier + SQLite)

- 🥶 **It sleeps:** after 15 min without visitors the free app goes to sleep.
  The first request after sleep takes **~30–60 s** — wait and refresh.
- 🎙️ **Voice reports won't run:** the Whisper speech model needs more than the
  free instance's 512 MB RAM. Text reports work fine.
- 🗃️ **SQLite note:** data resets whenever Render redeploys/restarts — normal
  for now. **For production later**, add a free **Neon** database and set one
  environment variable:
  - `DATABASE_URL` = `postgresql+asyncpg://<your-neon-connection>?ssl=require`
  - That's it — the app switches automatically. (Details were in an earlier
    version of this guide; you can ask me for them again anytime.)

---

# 🚑 Quick troubleshooting

| Problem | Fix |
|---|---|
| First open is slow / "Cannot reach the API" | Free service was asleep — wait 30–60 s, refresh |
| `503` right after deploy | Still booting — wait 1–2 min and refresh |
| `/api/health` works but dashboard shows errors | Check `CORS_ALLOW_ALL=true` in Environment tab, save |
| Voice/audio upload fails | Expected on the free 512 MB instance — use text reports |
| Changed `backend\.env`, website unchanged | Website uses Render's **Environment** tab, not your local `.env` |
| Build fails | Render → **Manual Deploy** → **Clear build cache & deploy** |

---

# 💰 Cost

| Item | Cost |
|---|---|
| GitHub | $0 |
| Render (Free web service) | $0 |
| Database (built-in SQLite for now) | $0 |
| **Total** | **$0 / month** |

---

*Your Peace-Watch backend is now a real internet citizen. 🕊️*