#!/usr/bin/env bash
set -euo pipefail

# Azure deployment: App with SQLite on Azure Container Instances (ACI)
# Architecture:
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
APP_PORT="${APP_PORT:-80}"
APP_DNS_LABEL="${APP_DNS_LABEL:-backend-apotek-app-$RANDOM}"

# SQLite settings
SQLITE_PATH="${SQLITE_PATH:-/app/data/data.sqlite}"
# Optional Azure File Share (for persistence)
FILE_SHARE_NAME="${FILE_SHARE_NAME:-}"
STORAGE_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME:-}"
STORAGE_ACCOUNT_KEY="${STORAGE_ACCOUNT_KEY:-}"
FILE_SHARE_MOUNT_PATH="${FILE_SHARE_MOUNT_PATH:-/app/data}"

# App settings
SESSION_SECRET="${SESSION_SECRET:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
NOTIFY_TO="${NOTIFY_TO:-}"

# Seeding settings
RUN_DB_SEED="${RUN_DB_SEED:-true}"
SEED_COMMAND="${SEED_COMMAND:-npm run seed}"

if [[ -z "$SUBSCRIPTION_ID" || -z "$SESSION_SECRET" ]]; then
  echo "ERROR: SUBSCRIPTION_ID and SESSION_SECRET are required."
  exit 1
fi

# DNS label constraints for ACI
APP_DNS_LABEL="$(echo "$APP_DNS_LABEL" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | cut -c1-50)"
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

echo "[3/6] Building and pushing app image to ACR..."
az acr build --registry "$ACR_NAME" --image "backend-apotek:$IMAGE_TAG" . >/dev/null
echo "[4/6] Seeding database (before app deployment)..."
if [[ "$RUN_DB_SEED" == "true" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm is required to run seed script but was not found."
    exit 1
  fi

  (
    cd "$PROJECT_ROOT"
    SQLITE_PATH="$SQLITE_PATH" $SEED_COMMAND
  )
else
  echo "Skipping DB seed because RUN_DB_SEED=$RUN_DB_SEED"
fi

if [[ "$APP_PORT" == "80" ]]; then
  APP_BASE_URL="http://${APP_DNS_LABEL}.${LOCATION}.azurecontainer.io"
else
  APP_BASE_URL="http://${APP_DNS_LABEL}.${LOCATION}.azurecontainer.io:${APP_PORT}"
fi

echo "[5/6] Deploying App container (public endpoint)..."
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

AZURE_FILE_ARGS=()
if [[ -n "$FILE_SHARE_NAME" && -n "$STORAGE_ACCOUNT_NAME" && -n "$STORAGE_ACCOUNT_KEY" ]]; then
  AZURE_FILE_ARGS=(
    --azure-file-volume-share-name "$FILE_SHARE_NAME"
    --azure-file-volume-account-name "$STORAGE_ACCOUNT_NAME"
    --azure-file-volume-account-key "$STORAGE_ACCOUNT_KEY"
    --azure-file-volume-mount-path "$FILE_SHARE_MOUNT_PATH"
  )
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
  "${AZURE_FILE_ARGS[@]}" \
  --environment-variables \
    NODE_ENV=production \
    PORT="$APP_PORT" \
    SESSION_SECRET="$SESSION_SECRET" \
    SESSION_COOKIE_SECURE=false \
    SQLITE_PATH="$SQLITE_PATH" \
    APP_BASE_URL="$APP_BASE_URL" \

echo "[6/6] Fetching app endpoint..."
APP_FQDN="$(az container show -g "$RESOURCE_GROUP" -n "$APP_CONTAINER_NAME" --query ipAddress.fqdn -o tsv)"
APP_PUBLIC_IP="$(az container show -g "$RESOURCE_GROUP" -n "$APP_CONTAINER_NAME" --query ipAddress.ip -o tsv)"

echo "Deployment selesai"
if [[ "$APP_PORT" == "80" ]]; then
  echo "App ACI (public): http://$APP_FQDN"
else
  echo "App ACI (public): http://$APP_FQDN:$APP_PORT"
fi
echo "App Public IP: $APP_PUBLIC_IP"
echo ""
echo "Note: For persistence, mount an Azure File Share (FILE_SHARE_NAME/STORAGE_ACCOUNT_NAME/STORAGE_ACCOUNT_KEY)."
