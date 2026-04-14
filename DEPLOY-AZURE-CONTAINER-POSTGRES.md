# Azure ACI + PostgreSQL Container Deployment

This project is prepared for a low-cost setup using separate Azure Container Instances (ACI):

- 1 ACI for app
- 1 ACI for PostgreSQL
- App is publicly exposed
- PostgreSQL container uses Azure File Share as persistent volume

## What was prepared

- Containerization:
  - [Dockerfile](Dockerfile)
  - [.dockerignore](.dockerignore)
  - [docker-compose.yml](docker-compose.yml) (local test with PostgreSQL)
- App runtime hardening for cloud:
  - Proxy-aware secure sessions in [server.js](server.js)
   - Health endpoint in [server.js](server.js)
   - Readiness endpoint in [server.js](server.js)
   - Graceful shutdown on SIGINT/SIGTERM in [server.js](server.js)
- PostgreSQL connection improvements:
  - `DATABASE_URL` support in [database/database.js](database/database.js)
   - SSL handling options in [database/database.js](database/database.js)
- Azure deployment automation script:
  - [infra/azure/deploy.sh](infra/azure/deploy.sh)

## Required environment variables

For production (Azure):

- `NODE_ENV=production`
- `PORT=3000`
- `SESSION_SECRET=<strong-random-value>`
- `SESSION_COOKIE_SECURE=false` (HTTP on ACI public endpoint)
- `DATABASE_URL=postgresql://<user>:<password>@<postgres-fqdn>:5432/<db>?sslmode=disable`
- `PG_SSL=false`
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
   - `export POSTGRES_PASSWORD='...'`
   - `export SESSION_SECRET='...'`
   - Optional: `SMTP_USER`, `SMTP_PASS`, `NOTIFY_TO`, `RESOURCE_GROUP`, `LOCATION`, `APP_DNS_LABEL`, `POSTGRES_DNS_LABEL`
4. Run deployment:
   - `bash infra/azure/deploy.sh`

After deployment, the script prints public app/postgres endpoints.

## Notes

- App is publicly reachable through ACI public endpoint.
- PostgreSQL is also publicly reachable in this mode.
- PostgreSQL persistence is provided by Azure File Share mounted at `/var/lib/postgresql/data`.
- For production security, rotate all secrets after first deployment.
