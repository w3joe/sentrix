#!/bin/sh
# For Sysbox: start Docker daemon inside the container, wait until ready, then run the app.
# Entrypoint runs as root so dockerd can start; we then drop to the sandbox user for the app.
set -e
dockerd --storage-driver=vfs &
until docker info >/dev/null 2>&1; do sleep 1; done
exec runuser -u sandbox -- "$@"
