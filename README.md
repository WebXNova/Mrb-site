# MRB Learning Platform

Full-stack learning platform for MRB students.

## Tech Stack

- Frontend: React + Vite + custom CSS
- Backend: Node.js + Express
- Databases:
  - MySQL (structured entities)
  - MongoDB (activity logs and flexible documents)

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

Make sure MySQL and MongoDB are running and env values are configured.
