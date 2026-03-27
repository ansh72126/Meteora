# Supabase Auth + Plot Studio

This monorepo contains:
- `frontend/` - Next.js app
- `backend/` - FastAPI plotting API

## Local Setup

### 1) Frontend
```bash
cd frontend
npm install
npm run dev
```

### 2) Backend (without Docker)
```bash
cd backend
python -m venv venv
venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3) Backend (with Docker Compose)
From repository root:
```bash
docker compose up --build
```

## Environment Variables

### Backend (`backend/.env`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FRONTEND_URL`
- `ALLOW_LOCALHOST_CORS` (optional, default `false`)

Use `backend/.env.example` as template.

### Frontend (`frontend/.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_API_URL`

Use `frontend/.env.example` as template.

## Deployment

### Frontend -> Vercel
1. Import repository in Vercel.
2. Set **Root Directory** to `frontend`.
3. Add env vars from `frontend/.env.example`.
4. Set `NEXT_PUBLIC_API_URL` to the deployed backend URL (Render).
5. Deploy.

### Backend -> Render
1. Create a new **Web Service** from this repo.
2. Set **Root Directory** to `backend`.
3. Build command:
   ```bash
   pip install -r requirements.txt
   ```
4. Start command:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
5. Add env vars from `backend/.env.example`.
6. Set `FRONTEND_URL` to your Vercel domain.

## GitHub Push Checklist

1. Ensure secrets are not tracked:
   - `.env` / `.env.local` must stay ignored.
2. Commit source + config files only.
3. Push branch:
   ```bash
   git add .
   git commit -m "prepare deployment config for frontend and backend"
   git push -u origin <branch-name>
   ```
