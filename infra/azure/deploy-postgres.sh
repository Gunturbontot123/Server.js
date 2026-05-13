#!/usr/bin/env bash
set -euo pipefail

# Azure deployment: PostgreSQL-only on Azure Container Instances (ACI)
# Architecture:
# - 1 ACI for PostgreSQL (public endpoint)

# ===== Required variables =====
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-backend-apotek}"
LOCATION="${LOCATION:-southeastasia}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# PostgreSQL container
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-backend-apotek-pg-aci}"
POSTGRES_DNS_LABEL="${POSTGRES_DNS_LABEL:-backend-apotek-pg-$RANDOM}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_CPU="${POSTGRES_CPU:-1}"
POSTGRES_MEMORY="${POSTGRES_MEMORY:-1}"

# Postgres settings
POSTGRES_DB="${POSTGRES_DB:-apotek}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

# Seeding settings
RUN_DB_SEED="${RUN_DB_SEED:-false}"
SEED_COMMAND="${SEED_COMMAND:-npm run seed}"

mask_value() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    echo "<empty>"
    return
  fi
  local len=${#value}
  if (( len <= 4 )); then
    echo "****"
  else
    echo "${value:0:2}****${value: -2}"
  fi
}

echo "===== ENV VAR SUMMARY (PostgreSQL deployment) ====="
echo "Required: SUBSCRIPTION_ID, POSTGRES_PASSWORD"
echo "SUBSCRIPTION_ID=${SUBSCRIPTION_ID:-<empty>}"
echo "POSTGRES_PASSWORD=$(mask_value "$POSTGRES_PASSWORD")"
echo ""
echo "Optional with defaults:"
echo "RESOURCE_GROUP=$RESOURCE_GROUP"
echo "LOCATION=$LOCATION"
echo "POSTGRES_CONTAINER_NAME=$POSTGRES_CONTAINER_NAME"
echo "POSTGRES_DNS_LABEL=$POSTGRES_DNS_LABEL"
echo "POSTGRES_PORT=$POSTGRES_PORT"
echo "POSTGRES_CPU=$POSTGRES_CPU"
echo "POSTGRES_MEMORY=${POSTGRES_MEMORY}Gi"
echo "POSTGRES_DB=$POSTGRES_DB"
echo "POSTGRES_USER=$POSTGRES_USER"
echo "RUN_DB_SEED=$RUN_DB_SEED"
echo "SEED_COMMAND=$SEED_COMMAND"
echo "===================================================="

if [[ -z "$SUBSCRIPTION_ID" || -z "$POSTGRES_PASSWORD" ]]; then
  echo "ERROR: SUBSCRIPTION_ID and POSTGRES_PASSWORD are required."
  exit 1
fi

# DNS label constraints for ACI
POSTGRES_DNS_LABEL="$(echo "$POSTGRES_DNS_LABEL" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | cut -c1-50)"

az account set --subscription "$SUBSCRIPTION_ID"

echo "[1/5] Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null

echo "[2/5] Deploying PostgreSQL container (non-persistent)..."
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
  --cpu "$POSTGRES_CPU" \
  --memory "$POSTGRES_MEMORY" \
  --restart-policy Always \
  --ip-address Public \
  --dns-name-label "$POSTGRES_DNS_LABEL" \
  --ports "$POSTGRES_PORT" \
  --environment-variables \
    POSTGRES_DB="$POSTGRES_DB" \
    POSTGRES_USER="$POSTGRES_USER" \
    POSTGRES_PASSWORD="$POSTGRES_PASSWORD"

echo "[3/5] Waiting for PostgreSQL endpoint..."
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

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PG_FQDN}:${POSTGRES_PORT}/${POSTGRES_DB}?sslmode=disable"

echo "[4/5] Seeding database..."
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

echo "[5/5] Fetching PostgreSQL endpoint..."
PG_PUBLIC_IP="$(az container show -g "$RESOURCE_GROUP" -n "$POSTGRES_CONTAINER_NAME" --query ipAddress.ip -o tsv)"

echo "Deployment selesai"
echo "PostgreSQL ACI (public): $PG_FQDN:$POSTGRES_PORT"
echo "PostgreSQL Public IP: $PG_PUBLIC_IP"
echo "DATABASE_URL for app: $DATABASE_URL"
echo ""
echo "Note: PostgreSQL is publicly reachable in this mode. Apply strong password and NSG/firewall controls where possible."
