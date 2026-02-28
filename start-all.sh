#!/usr/bin/env bash
#
# start-all.sh — Launch all Sentrix services in one command.
#
# Usage:
#   ./start-all.sh           # Demo mode (built-in fake agents)
#   SANDBOX_RUN=latest ./start-all.sh   # Live sandbox data for Patrol Swarm
#

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# PIDs for cleanup
declare -a PIDS=()

cleanup() {
  echo -e "\n${YELLOW}Shutting down services...${NC}"
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  # Kill any child processes (e.g. uvicorn workers spawned by subshells)
  pkill -P $$ 2>/dev/null || true
  wait 2>/dev/null || true
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${CYAN}Sentrix — Starting all services${NC}"
echo "────────────────────────────────────────────"

# 1. Bridge DB API (port 3001)
echo -e "${GREEN}[1/4]${NC} Bridge DB API → http://localhost:3001"
uvicorn bridge_db.api:app --host 0.0.0.0 --port 3001 --reload &
PIDS+=($!)
sleep 1

# 2. Patrol Swarm API (port 8001)
echo -e "${GREEN}[2/4]${NC} Patrol Swarm API → http://localhost:8001 ${YELLOW}(cwd: patrolswarm/)${NC}"
(
  cd patrolswarm
  uvicorn patrol_swarm.api:app --host 0.0.0.0 --port 8001 --reload
) &
PIDS+=($!)
sleep 1

# 3. Investigation API (port 8002)
echo -e "${GREEN}[3/4]${NC} Investigation API → http://localhost:8002"
uvicorn investigation.api:app --host 0.0.0.0 --port 8002 --reload &
PIDS+=($!)
sleep 1

# 4. Frontend (port 3000)
echo -e "${GREEN}[4/4]${NC} Frontend → http://localhost:3000"
(
  cd frontend
  npm run dev
) &
PIDS+=($!)

echo "────────────────────────────────────────────"
echo -e "${GREEN}All services started.${NC}"
echo ""
echo "  Bridge DB:      http://localhost:3001"
echo "  Patrol Swarm:   http://localhost:8001"
echo "  Investigation:  http://localhost:8002"
echo "  Frontend:       http://localhost:3000"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services.${NC}"
echo ""

wait
