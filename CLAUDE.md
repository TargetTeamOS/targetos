# TargetOS V2 — Claude Project Instructions

Real estate CRM for Target Team at KW Valley Realty, Rockland County NY.
Live: https://app.targetreteam.com

## Deploy
```bash
npm run build          # must show "✓ built" with NO errors
git add -A && git commit -m "description"
git push origin v2:main --force   # live in ~90 seconds
```

## Critical JSX Rules (esbuild — violations crash the app silently)
- NO backticks in JSX render paths — use string concatenation
- NO regex literals in JSX expressions — use .split().join()
- NO spread in JSX style props
- All /api/*.js must be CommonJS (module.exports / require)

## Before every push
1. npm run build must show "✓ built" zero errors
2. Check for backticks: grep -c '`' src/pages/CHANGED.jsx  → must be 0
3. Verify every JSX component used has an import at top of file

## Stack
React 18 + Vite 5, Supabase PostgreSQL, Vercel hosting, Twilio phone, Resend email

## Full credentials and architecture
See DEVELOPER_ACCESS.md (not in repo — stored securely, see Yanky)
