#!/usr/bin/env bash
set -euo pipefail

# Azure deployment: App + PostgreSQL as separate Azure Container Instances (ACI)
# Architecture:
# - 1 ACI for PostgreSQL (public endpoint)
# - 1 ACI for App (public endpoint)
# - 1 ACR for app image

# ===== Required variables =====
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-backend-apotek}"
LOCATION="${LOCATION:-southeastasia}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# App image/containers
ACR_NAME="${ACR_NAME:-backendapotekacr$RANDOM}"
ACR_LOCATION="${ACR_LOCATION:-$LOCATION}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME:-backend-apotek-app-aci}"
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-backend-apotek-pg-aci}"
APP_PORT="${APP_PORT:-80}"
APP_DNS_LABEL="${APP_DNS_LABEL:-backend-apotek-app-$RANDOM}"
POSTGRES_DNS_LABEL="${POSTGRES_DNS_LABEL:-backend-apotek-pg-$RANDOM}"

# Postgres settings
POSTGRES_DB="${POSTGRES_DB:-apotek}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

# App settings
SESSION_SECRET="${SESSION_SECRET:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
NOTIFY_TO="${NOTIFY_TO:-}"

# Seeding settings
RUN_DB_SEED="${RUN_DB_SEED:-true}"
SEED_COMMAND="${SEED_COMMAND:-npm run seed}"

if [[ -z "$SUBSCRIPTION_ID" || -z "$POSTGRES_PASSWORD" || -z "$SESSION_SECRET" ]]; then
  echo "ERROR: SUBSCRIPTION_ID, POSTGRES_PASSWORD, and SESSION_SECRET are required."
  exit 1
fi

# DNS label constraints for ACI
APP_DNS_LABEL="$(echo "$APP_DNS_LABEL" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | cut -c1-50)"
POSTGRES_DNS_LABEL="$(echo "$POSTGRES_DNS_LABEL" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | cut -c1-50)"

az account set --subscription "$SUBSCRIPTION_ID"

echo "[1/8] Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null

echo "[2/8] Ensuring ACR exists..."
if az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" >/dev/null 2>&1; then
  echo "ACR already exists: $ACR_NAME (reuse)"
else
  az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --location "$ACR_LOCATION" \
    --sku Basic \
    --admin-enabled true >/dev/null
fi

ACR_LOGIN_SERVER="$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query loginServer -o tsv)"
ACR_USERNAME="$(az acr credential show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query username -o tsv)"
ACR_PASSWORD="$(az acr credential show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query passwords[0].value -o tsv)"
IMAGE="$ACR_LOGIN_SERVER/backend-apotek:$IMAGE_TAG"

echo "[3/8] Building and pushing app image to ACR..."
az acr build --registry "$ACR_NAME" --image "backend-apotek:$IMAGE_TAG" . >/dev/null

echo "[4/8] Deploying PostgreSQL container (non-persistent)..."
if az container show -g "$RESOURCE_GROUP" -n "$POSTGRES_CONTAINER_NAME" >/dev/null 2>&1; then
  echo "PostgreSQL container exists, replacing: $POSTGRES_CONTAINER_NAME"
  az container delete -g "$RESOURCE_GROUP" -n "$POSTGRES_CONTAINER_NAME" --yes >/dev/null
  for _ in {1..60}; do
    if ! az container show -g "$RESOURCE_GROUP" -n "$POSTGRES_CONTAINER_NAME" >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done
fi

az container create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_CONTAINER_NAME" \
  --os-type Linux \
  --image postgres:16-alpine \
  --cpu 1 \
  --memory 1.5 \
  --restart-policy Always \
  --ip-address Public \
  --dns-name-label "$POSTGRES_DNS_LABEL" \
  --ports 5432 \
  --environment-variables \
    POSTGRES_DB="$POSTGRES_DB" \
    POSTGRES_USER="$POSTGRES_USER" \
    POSTGRES_PASSWORD="$POSTGRES_PASSWORD"

echo "[5/8] Waiting for PostgreSQL endpoint..."
for _ in {1..30}; do
  PG_FQDN="$(az container show -g "$RESOURCE_GROUP" -n "$POSTGRES_CONTAINER_NAME" --query ipAddress.fqdn -o tsv 2>/dev/null || true)"
  if [[ -n "$PG_FQDN" && "$PG_FQDN" != "None" ]]; then
    break
  fi
  sleep 5
done

if [[ -z "${PG_FQDN:-}" || "$PG_FQDN" == "None" ]]; then
  echo "ERROR: PostgreSQL FQDN not found."
  exit 1
fi

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PG_FQDN}:5432/${POSTGRES_DB}?sslmode=disable"

echo "[6/8] Seeding database (before app deployment)..."
if [[ "$RUN_DB_SEED" == "true" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm is required to run seed script but was not found."
    exit 1
  fi

  (
    cd "$PROJECT_ROOT"
    DATABASE_URL="$DATABASE_URL" PG_SSL=false $SEED_COMMAND
  )
else
  echo "Skipping DB seed because RUN_DB_SEED=$RUN_DB_SEED"
fi

if [[ "$APP_PORT" == "80" ]]; then
  APP_BASE_URL="http://${APP_DNS_LABEL}.${LOCATION}.azurecontainer.io"
else
  APP_BASE_URL="http://${APP_DNS_LABEL}.${LOCATION}.azurecontainer.io:${APP_PORT}"
fi

echo "[7/8] Deploying App container (public endpoint)..."
if az container show -g "$RESOURCE_GROUP" -n "$APP_CONTAINER_NAME" >/dev/null 2>&1; then
  echo "App container exists, replacing: $APP_CONTAINER_NAME"
  az container delete -g "$RESOURCE_GROUP" -n "$APP_CONTAINER_NAME" --yes >/dev/null
  for _ in {1..60}; do
    if ! az container show -g "$RESOURCE_GROUP" -n "$APP_CONTAINER_NAME" >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done
fi

az container create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_CONTAINER_NAME" \
  --os-type Linux \
  --image "$IMAGE" \
  --registry-login-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu 1 \
  --memory 1 \
  --restart-policy Always \
  --ip-address Public \
  --dns-name-label "$APP_DNS_LABEL" \
  --ports "$APP_PORT" \
  --environment-variables \
    NODE_ENV=production \
    PORT="$APP_PORT" \
    SESSION_SECRET="$SESSION_SECRET" \
    SESSION_COOKIE_SECURE=false \
    PG_SSL=false \
    DATABASE_URL="$DATABASE_URL" \
    APP_BASE_URL="$APP_BASE_URL" \

echo "[8/8] Fetching app endpoint..."
APP_FQDN="$(az container show -g "$RESOURCE_GROUP" -n "$APP_CONTAINER_NAME" --query ipAddress.fqdn -o tsv)"
APP_PUBLIC_IP="$(az container show -g "$RESOURCE_GROUP" -n "$APP_CONTAINER_NAME" --query ipAddress.ip -o tsv)"
PG_PUBLIC_IP="$(az container show -g "$RESOURCE_GROUP" -n "$POSTGRES_CONTAINER_NAME" --query ipAddress.ip -o tsv)"

echo "Deployment selesai"
if [[ "$APP_PORT" == "80" ]]; then
  echo "App ACI (public): http://$APP_FQDN"
else
  echo "App ACI (public): http://$APP_FQDN:$APP_PORT"
fi
echo "App Public IP: $APP_PUBLIC_IP"
echo "PostgreSQL ACI (public): $PG_FQDN:5432"
echo "PostgreSQL Public IP: $PG_PUBLIC_IP"
echo ""
echo "Note: PostgreSQL is publicly reachable in this mode. Apply strong password and NSG/firewall controls where possible."
