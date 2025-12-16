# File Manager — Full‑Stack App (FastAPI + React)

A production‑style **file management web application** built with **FastAPI** and a clean **React (Vite)** frontend.

The system uses:
- **Firebase Authentication (Google Sign‑In)** for auth
- **Google Cloud Storage (GCS)** for file bytes
- **Firestore** for metadata and text‑search indexing

The repository is intentionally designed to be:
- easy to run locally (with or without Docker)
- predictable for reviewers
- close to a real production setup

---

## Features

- ✅ Google Sign‑In via **Firebase Auth**
- ✅ Users can manage **only their own files**
- ✅ Admin users can **view all files** (read‑only)
- ✅ Upload / list / download / delete files
- ✅ Supported file types: **.txt, .json, .pdf**
- ✅ Search:
  - by metadata (name/type/date)
  - by **text content inside files**
- ✅ Clean frontend UX
  - optimistic delete + **Undo** toast
- ✅ Monitoring demo with **Prometheus**

---

## Tech Stack

### Backend
- Python 3.12
- FastAPI
- Firebase Admin SDK (ID token verification)
- Firestore (metadata + search index)
- Google Cloud Storage (file bytes)
- Prometheus metrics endpoint

### Frontend
- React + TypeScript
- Vite
- Firebase Web SDK (Google Sign‑In)
- Static build served by **Nginx**

### Infrastructure
- Docker & Docker Compose
- Prometheus

---

## Project Structure

```
.
├── backend/
│   ├── app/
│   ├── Dockerfile
│   ├── .env
│   └── serviceAccount.json   # required for Docker (not committed)
│
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── .env                  # used for local Vite dev
│
├── docker-compose.yml
├── prometheus.yml
├── .env                      # root env (Docker build‑time)
└── README.md
```

---

## Environment Variables (Important)

This project intentionally uses **multiple `.env` files**, each with a specific responsibility.

### 1️⃣ `backend/.env` — Backend runtime configuration

Used when:
- running backend locally (without Docker)
- running backend inside Docker

Example:
```env
GCP_PROJECT_ID=file-management-e1e8c
GCS_BUCKET=file-management-e1e8c-bucket
FIREBASE_PROJECT_ID=file-management-e1e8c
ADMIN_EMAILS=admin@example.com
```

Loaded in Docker via:
```yaml
env_file:
  - ./backend/.env
```

---

### 2️⃣ `frontend/.env` — Frontend local development (Vite)

Used **only** when running:
```bash
npm run dev
```

Example:
```env
VITE_API_BASE_URL=http://localhost:8001
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

⚠️ This file is **not used during Docker builds**.

---

### 3️⃣ Root `.env` — Docker Compose build‑time variables (Required)

Docker Compose reads variables from the **root `.env` file** (next to `docker-compose.yml`) to substitute **frontend build arguments**.

Create `./.env`:
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...

# optional (only if used)
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

These values are injected **at build time** because Vite embeds them directly into static JavaScript files.

---

## Firebase Service Account (Required for Docker)

When running the backend **inside Docker**, Firebase Admin SDK **cannot reuse your local machine credentials**.

A Firebase **service account JSON** is required.

### Setup

1. Firebase Console → Project Settings → **Service Accounts**
2. Generate a new private key
3. Save it as:
   ```
   backend/serviceAccount.json
   ```

This file is mounted into the backend container and referenced via:
```env
GOOGLE_APPLICATION_CREDENTIALS=/secrets/serviceAccount.json
```

⚠️ **Do NOT commit this file** (it must be ignored by git).

---

## Running Locally (Without Docker)

### Backend
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### URLs
- Frontend: **http://localhost:5174**
- Backend: **http://localhost:8000**

---

## Running with Docker Compose

### Prerequisites
- Docker
- Docker Compose
- Root `.env` file created
- `backend/serviceAccount.json` present

### Start all services
```bash
docker compose up --build
```

### URLs (Docker)
- Frontend: **http://localhost:5174**
- Backend: **http://localhost:8001**
- Prometheus: **http://localhost:9090**

### Stop
```bash
docker compose down
```

### Logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

## Why frontend env vars behave differently in Docker

The frontend is built using **Vite**, which embeds `VITE_*` variables into static assets during:
```bash
npm run build
```

Because of this:
- `env_file:` does **not** work for frontend Docker builds
- Firebase config **must be provided at build time**
- Docker Compose reads these values from the **root `.env` file**

This is expected behavior for Vite + Docker.

---

## API Overview (High Level)

- `POST /api/files` — upload files
- `GET /api/files` — list files (admin can view all)
- `GET /api/files/{id}/download` — stream download
- `DELETE /api/files/{id}` — delete (owner only)
- `GET /api/files/search?text=...` — text search inside file contents

Auth header:
```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

---

## Monitoring

Prometheus is included to demonstrate:
- request counts
- error rates
- latency patterns

Backend exposes metrics at `/metrics`.

---

## Sequence Diagrams (Conceptual)
Below is the textual description of the three key flows reviewers typically look for.

### 1) Authentication flow (Google Sign-In)

1. User clicks **Sign in with Google** in the frontend
2. Frontend uses Firebase Auth and receives a **Firebase ID token**
3. Frontend sends requests to the backend with `Authorization: Bearer <id_token>`
4. Backend verifies the token (Firebase) and extracts the user identity (uid/email)
5. Backend applies authorization rules:
   - regular user: can only access own files
   - admin user: can view all files, but cannot delete for others

### 2) Upload flow

1. User selects a file in the UI
2. Frontend sends a multipart upload to the backend with the ID token
3. Backend:
   - verifies token
   - validates file extension and content type
   - uploads bytes to **GCS**
4. Backend creates a Firestore record:
   - owner id/email
   - filename, content type, size, timestamps
   - GCS path
5. Backend extracts text (for supported types) and stores a searchable field in Firestore
6. Frontend refreshes list and the new file appears

### 3) Download flow

1. User clicks download
2. Frontend calls backend: `/api/files/{id}/download` with ID token
3. Backend:
   - verifies token
   - checks permissions (owner or allowed admin view)
4. Backend streams file bytes from **GCS** back to the browser

---

## Production Deployment

The application is also deployed to **Google Cloud Platform** for demonstration purposes.

### Production URLs

- **Frontend (Firebase Hosting):**  
  https://file-management-e1e8c.web.app/

- **Backend API (Cloud Run):**  
  https://file-manager-run-268171530438.me-west1.run.app/

### Backend Endpoints (Production)

- **API base:**  
  https://file-manager-run-268171530438.me-west1.run.app/

- **Swagger / OpenAPI docs:**  
  https://file-manager-run-268171530438.me-west1.run.app/docs

- **Health check:**  
  https://file-manager-run-268171530438.me-west1.run.app/health

- **Metrics (Prometheus):**  
  https://file-manager-run-268171530438.me-west1.run.app/metrics

This production deployment is **optional** and not required to run the project locally or via Docker.

---

## Notes for Reviewers

- Firebase Web API keys are **not secrets**
- Security is enforced via Firebase Auth + backend verification
- Docker, local dev, and production use the same auth flow
- Multiple `.env` files are intentional and documented

---

## Architectural decisions

### Why Cloud Run (instead of Cloud Functions)

This backend is a full HTTP service (FastAPI) with:
- streaming downloads
- multipart uploads
- metrics endpoint
- consistent container runtime

**Cloud Run** is the cleanest fit because:
- it runs the exact Docker image you test locally
- it supports autoscaling (including scale-to-zero)
- it’s easier to reason about for an API service than function constraints

Cloud Functions shines for event handlers; this project is primarily an API service.

### Why Firestore + GCS

- **GCS** is built for storing file bytes cheaply and reliably
- **Firestore** is a great fit for fast metadata queries (per-user lists, admin views, filters)
- Keeping bytes and metadata separate keeps the data model clean and scalable

### Text search approach

For a take-home assignment, the goal is a **working** feature without heavy infra:
- extract text on upload (txt/json/pdf where possible)
- store a searchable text field in Firestore
- query via simple substring/token logic

In a larger production system, this can be swapped for:
- OpenSearch / Elasticsearch
- managed search services

---

## Next improvements (if this were extended)

- Pagination (list endpoints)
- Soft deletes + restore
- Background jobs for large PDFs (extraction)
- Real full-text search engine
- Alerting rules on Prometheus metrics

---
