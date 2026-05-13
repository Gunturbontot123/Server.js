# Azure ACI + SQLite Container Deployment

This project is prepared for a low-cost setup using Azure Container Instances (ACI):

- 1 ACI for app
- App is publicly exposed
- SQLite database can be persisted using Azure File Share

## What was prepared

- Containerization:
   - [Dockerfile](Dockerfile)
   - [.dockerignore](.dockerignore)
   - [docker-compose.yml](docker-compose.yml) (local test with SQLite)
- App runtime hardening for cloud:
  - Proxy-aware secure sessions in [server.js](server.js)
   - Health endpoint in [server.js](server.js)
   - Readiness endpoint in [server.js](server.js)
   - Graceful shutdown on SIGINT/SIGTERM in [server.js](server.js)
- SQLite storage:
   - `SQLITE_PATH` support in [database/database.js](database/database.js)
- Azure deployment automation script:
  - [infra/azure/deploy.sh](infra/azure/deploy.sh)

## Required environment variables

For production (Azure):

- `NODE_ENV=production`
- `PORT=3000`
- `SESSION_SECRET=<strong-random-value>`
- `SESSION_COOKIE_SECURE=false` (HTTP on ACI public endpoint)
- `SQLITE_PATH=/app/data/data.sqlite`
- `SMTP_USER=<optional>`
- `SMTP_PASS=<optional>`
- `NOTIFY_TO=<optional>`

## Local container test

1. Build + run locally:
   - `docker compose up --build`
2. Check app:
   - http://localhost:3000
3. Check health:
   - http://localhost:3000/healthz

## Azure deploy (automated)

1. Login to Azure:
   - `az login`
2. Register required provider:
   - `az provider register --namespace Microsoft.ContainerInstance`
3. Set required shell variables:
   - `export SUBSCRIPTION_ID=...`
   - `export SESSION_SECRET='...'`
   - Optional: `SMTP_USER`, `SMTP_PASS`, `NOTIFY_TO`, `RESOURCE_GROUP`, `LOCATION`, `APP_DNS_LABEL`
   - Optional (persistence): `FILE_SHARE_NAME`, `STORAGE_ACCOUNT_NAME`, `STORAGE_ACCOUNT_KEY`, `FILE_SHARE_MOUNT_PATH`
4. Run deployment:
   - `bash infra/azure/deploy.sh`

After deployment, the script prints the public app endpoint.

## Notes

- App is publicly reachable through ACI public endpoint.
- SQLite persistence is provided by Azure File Share mounted at `/app/data`.
- For production security, rotate all secrets after first deployment.
