# Debt Tracker App — How-To Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Running the App](#running-the-app)
4. [Stopping the App](#stopping-the-app)
5. [Building for Production](#building-for-production)
6. [PocketBase Admin Panel](#pocketbase-admin-panel)
7. [Environment Variables](#environment-variables)
8. [Database (PocketBase)](#database-pocketbase)
9. [Linting](#linting)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **macOS / Linux** (the PocketBase binary is already included under `pocketbase/`)

---

## Initial Setup

Install frontend dependencies once after cloning:

```bash
npm install
```

Make the PocketBase binary and startup script executable (first time only):

```bash
chmod +x pocketbase/pocketbase
chmod +x start-db.sh
```

---

## Running the App

The app requires **two processes** running at the same time: the PocketBase backend and the Vite dev server.

### 1. Start the PocketBase backend

Open a terminal and run:

```bash
./start-db.sh
```

PocketBase will be available at `http://127.0.0.1:8090`.  
Keep this terminal open while using the app.

### 2. Start the Vite dev server

Open a **second** terminal and run:

```bash
npm run dev
```

Open the URL printed in the terminal (usually `http://localhost:5173`) in your browser.

---

## Stopping the App

- Press `Ctrl + C` in the PocketBase terminal to stop the backend.
- Press `Ctrl + C` in the Vite terminal to stop the frontend dev server.

---

## Building for Production

```bash
npm run build
```

The output is placed in the `dist/` folder. To preview the production build locally:

```bash
npm run preview
```

---

## PocketBase Admin Panel

When PocketBase is running, navigate to:

```
http://127.0.0.1:8090/_/
```

From the admin panel you can:
- Browse and edit records in the `kv_store` collection.
- Manage collections and schema.
- Create an admin account on first launch (you will be prompted automatically).

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_PB_URL` | `http://127.0.0.1:8090` | PocketBase server URL used by the frontend |

To override, create a `.env.local` file at the project root:

```env
VITE_PB_URL=http://127.0.0.1:8090
```

---

## Database (PocketBase)

Data is persisted in **two places** simultaneously:
- **PocketBase** (`pocketbase/pb_data/`) — primary storage via the `kv_store` collection.
- **localStorage** — automatic fallback when PocketBase is unreachable.

### Key-value schema (`kv_store` collection)

| Field | Type | Description |
|---|---|---|
| `key` | text | Unique identifier for the record |
| `data` | json | Arbitrary JSON payload |

Migrations live in `pocketbase/pb_migrations/` and are applied automatically when PocketBase starts.

---

## Linting

Run ESLint across all source files:

```bash
npm run lint
```

---

## Troubleshooting

### App shows "offline" or data doesn't save to the cloud
- Make sure `./start-db.sh` is running in a separate terminal.
- Confirm PocketBase responds: `curl http://127.0.0.1:8090/api/health`
- The app falls back to localStorage automatically; data is not lost.

### Port conflict on 8090
Edit `start-db.sh` and change the `--http` flag, then update `VITE_PB_URL` in `.env.local` to match.

### Port conflict on 5173
Vite will automatically try the next available port and print the actual URL in the terminal.

### Resetting all data
Delete `pocketbase/pb_data/` to wipe the database, and clear `localStorage` in your browser's DevTools (`Application → Local Storage → Clear All`).

### PocketBase binary not executable
```bash
chmod +x pocketbase/pocketbase
```
