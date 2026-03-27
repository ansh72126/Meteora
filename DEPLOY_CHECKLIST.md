# Deploy Checklist (Orderwise)

Follow this exact order to deploy safely.

## 1) Prerequisites
- Install Docker Desktop
- Install Node.js LTS + npm
- Install Git
- Have GitHub, Vercel, and Render accounts

## 2) Backend Docker verification
From repository root:

```bash
docker compose build --no-cache backend
docker compose up backend
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"healthy"}`

## 3) Frontend production build verification
From `frontend/`:

```bash
npm install
npm run build
```

## 4) Git and GitHub publish
Initialize (already done here), then set remote and push:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git branch -M main
git push -u origin main
```

## 5) Deploy frontend on Vercel
Vercel project settings:
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output: Next.js default

Set env vars in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (your Vercel domain)
- `NEXT_PUBLIC_API_URL` (Render backend URL after backend deploy)

Deploy once with temporary API URL if needed, then redeploy after Render URL is ready.

## 6) Deploy backend on Render
Create Web Service:
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Set env vars in Render:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FRONTEND_URL` (your Vercel domain, no trailing slash preferred)
- `ALLOW_LOCALHOST_CORS=false`

## 7) Wire frontend to backend URL
Update Vercel env:
- `NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com`

Redeploy frontend in Vercel.

## 8) End-to-end smoke test
1. Open frontend URL
2. Signup
3. Verify OTP
4. Confirm redirect to upload/dashboard
5. Upload CSV
6. Generate at least one plot from each module (univariate, bivariate, multivariate, timeseries)
7. Logout and verify cleanup path works

## 9) Security checks before final release
- Ensure no secrets in git history
- Ensure `.env` and `.env.local` remain untracked
- Confirm CORS only allows deployed frontend in production
