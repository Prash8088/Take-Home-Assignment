#!/bin/sh

set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting API..."
node dist/server.js &

echo "Starting worker..."
node dist/queue/analysis.worker.js &

wait