FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (layer caches until requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY patrol_swarm/ patrol_swarm/
COPY .env.example .env.example

# SQLite DB and LangSmith traces land in /data (mount a volume here)
RUN mkdir -p /data
ENV PATROL_DB_URL=sqlite:////data/patrol_swarm.db

# Non-root user
RUN useradd -m -s /bin/bash patrol
RUN chown -R patrol:patrol /app /data
USER patrol

CMD ["python", "-m", "patrol_swarm.main", "--mode", "continuous"]
