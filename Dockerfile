FROM python:3.11-slim

# Install git, Docker CLI, and runuser (drop privileges after entrypoint starts dockerd)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git docker.io util-linux && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY sandbox/ sandbox/
RUN chmod +x sandbox/docker-entrypoint.sh

# Run as non-root. When DOCKER_GID=0 (e.g. Sysbox/inner daemon), sandbox still joins the
# docker group created by docker.io so it can use the inner dockerd's socket.
# When DOCKER_GID is set to the host's docker GID, socket is for host daemon (trusted envs only).
ARG DOCKER_GID=0
RUN if [ -n "${DOCKER_GID}" ] && [ "${DOCKER_GID}" -ne 0 ] 2>/dev/null; then \
      groupadd -g ${DOCKER_GID} docker 2>/dev/null || true; \
      useradd -m -s /bin/bash -G docker sandbox; \
    else \
      useradd -m -s /bin/bash -G docker sandbox; \
    fi && chown -R sandbox:sandbox /app
USER sandbox

# Sandbox dir is mounted from the host for forensics. Git runs only in ephemeral
# containers (--network none). Inner run_tests/run_python_script use --network none
# and read-only .git mount.

CMD ["python", "-m", "sandbox"]
