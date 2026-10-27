#!/bin/sh
set -eu

mkdir -p /app/data
chown nextjs:nodejs /app/data

export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"

exec runuser -u nextjs -- node server.js
