# Run AutoGrade with Docker Desktop

## Before starting

1. Start Docker Desktop and use its Linux-container engine (the WSL 2 backend is recommended).
2. Leave at least 15 GB of free disk space for the AI image and downloaded models. Allocate at least 8 GB of memory and 4 CPUs to Docker Desktop if your computer can spare them.
3. Keep `backend/.env` and `ai-service/.env` in place if you use custom authentication or AI settings. They are passed into their respective containers when present; never copy secrets into a Dockerfile.

## Start the application

Open PowerShell in the repository root and run:

```powershell
docker compose up --build
```

The first build downloads Python dependencies and the SBERT and TrOCR checkpoints. Compose also pulls the configured Ollama model. This may take a while and use several gigabytes; later starts reuse the built images and persistent model volumes.

When the containers are ready, open:

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:3001>
- AI service health: <http://localhost:8000/health>

The Docker Compose database starts empty and is separate from any PostgreSQL instance already installed on Windows. The backend creates its schema and seeds its predefined admin accounts at startup. Existing users and exams in the Windows PostgreSQL database are not copied automatically. The Compose database credentials are local-development-only and are not intended for public deployment.

If you use `admin@academy.com`, make sure `backend/.env` contains `AUTHORIZED_ADMIN_EMAILS=admin@academy.com`. Since the Docker database is new, the account is not imported from Windows PostgreSQL; the backend can create the authorized admin account the first time you sign in with it.

## Common commands

Run the already-built stack:

```powershell
docker compose up
```

Stop the stack without deleting database, uploads, or model data:

```powershell
docker compose down
```

View service status or logs:

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f ai-service
```

To delete all Compose data, including the database, uploaded PDFs, and downloaded Ollama/PaddleOCR models:

```powershell
docker compose down --volumes
```

Only run the last command if you intentionally want to erase that data.

## Notes

- The backend and AI containers share a persistent volume at the same path so the AI service can read uploaded PDFs.
- PostgreSQL, Ollama, and model caches use persistent Docker volumes.
- The AI container runs with CPU-based PyTorch/Paddle dependencies. OCR and Ollama workloads can be slow on CPU; Docker does not make model inference faster by itself.
- This Compose file is for local development on Docker Desktop, not production. Change the development database credentials and configure production secrets before exposing services publicly.
