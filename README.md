# GATE 2027 Offline Dashboard

Personal exam-prep dashboard. **Next.js + local SQLite** - no cloud, no login, works with no internet.

## Run it (Windows)
1. Install Node.js 20 LTS once.
2. Double-click **`start-gate.bat`** (first run installs + builds, then opens the browser).
3. After changing code, run **`update-app.bat`**.

Manual: `npm install` -> `npm run build` -> `npm start`  (dev mode: `npm run dev`)

## Features
Dashboard + countdown - Daily To-Do (1 Oct 2026 - 31 Jan 2027) - Syllabus tracker (4 checkpoints/topic) -
Weekly matrix - Library (subject/chapter wise) - Error log + Review mode - PDF Notes viewer
(pen/highlight/text/bookmarks) - SM-2 Flashcards - Study links - Subject weightage - Mock-test trend.

## Where your data lives
| What | Where | Notes |
|---|---|---|
| Everything except PDFs | `local.db` (+ `local.db-wal`, `local.db-shm` while running) | SQLite |
| Uploaded PDFs | `pdfs/<Subject>/<Chapter>/file.pdf` | deleted PDFs go to `pdfs/_trash/` |
| Backups | `BACKUP_DIR` or `<data>/backups/` | `db/local-<timestamp>.db` (last 30) + one mirrored `pdfs/` |

Set `DATA_DIR` in `.env.local` (see `.env.local.example`) to keep `local.db` and `pdfs/` **outside** the code
folder, e.g. `DATA_DIR=D:/GATE-Data`. Then you can replace the whole app folder with a new version and
your data is untouched. To move existing data: stop the app, move `local.db` and `pdfs/` into that folder.

## Backup / restore
- Automatic on every `npm start`; manual: `npm run backup`. A failed backup never stops the app.
- **Restore:** stop the app, copy a `backups/db/local-....db` over `local.db`, delete `local.db-wal` / `local.db-shm`, start again.
- Never copy/zip `local.db` while the app is running - use a backup snapshot instead (the live file is incomplete without its `-wal`).

## Security
No password. The server only listens on 127.0.0.1 and `middleware.ts` rejects foreign hosts and cross-site writes.
Do not expose it to the internet. To use it from a phone on your Wi-Fi, set `ALLOWED_HOSTS` and run next with `-H 0.0.0.0`.
