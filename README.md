# MRB Learning Platform

Full-stack learning platform for MRB students.

## Tech Stack

- Frontend: React + Vite + custom CSS
- Backend: Node.js + Express
- Database: MySQL (structured entities)
- Cache/Queue: Redis (sessions, rate limits, email queue)

## Apps

- `client/`: web frontend
- `server/`: backend API

## Run frontend

```bash
cd client
npm install
npm run dev
```

## Run backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Make sure MySQL and Redis are running and env values are configured.

## Production deployment

For Ubuntu 24.04 VPS (PM2 + Nginx + MySQL + Redis):

```bash
cp .env.example server/.env   # configure secrets
./deploy.sh
```

See [docs/deployment/README.md](docs/deployment/README.md) for full setup.

## Security notes

- Never commit `server/.env` or production secrets.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be strong random values (at least 32 characters).
- `REDIS_URL` is recommended everywhere and required in production when `REQUIRE_REDIS_IN_PRODUCTION=true`.
- If any secrets were exposed, rotate them before deployment.
- Admin bootstrap now requires `ADMIN_EMAIL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` in environment variables.
- `ALLOW_LEGACY_TOKEN_VERSION` can be used during token-version rollout and should be disabled after migration.
