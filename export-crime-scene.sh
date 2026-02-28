#!/bin/bash
# export-crime-scene.sh

# 1. Define Paths
NATIVE_DIR="/home/ubuntu/native_hackfest/sandbox"
MAC_DIR="/home/ubuntu/sonex_hackfest/sandbox_runs"

# 2. Ensure the destination directory exists on your Mac
mkdir -p "$MAC_DIR"

echo "Locating latest crime scene..."

# 3. Find the most recent sandbox session directory
LATEST_SCENE=$(ls -td ${NATIVE_DIR}/sandbox_* 2>/dev/null | head -1)

if [ -z "$LATEST_SCENE" ]; then
    echo "Error: No sandbox sessions found in $NATIVE_DIR"
    exit 1
fi

SCENE_NAME=$(basename "$LATEST_SCENE")
DEST_PATH="$MAC_DIR/$SCENE_NAME"

echo "Exporting [$SCENE_NAME] to Mac-linked folder..."

# ---------------------------------------------------------
# NEW: 3.5 Extract Git Forensics into flat text files
# ---------------------------------------------------------
FORENSICS_DIR="$LATEST_SCENE/git_forensics"
mkdir -p "$FORENSICS_DIR"

if [ -d "$LATEST_SCENE/workspace/.git" ]; then
    echo "Extracting Git history into readable text logs..."
    
    # 1. A clean, visual tree of all commits and branches
    git -C "$LATEST_SCENE/workspace" log --all --graph --decorate --oneline > "$FORENSICS_DIR/commit_graph.txt"
    
    # 2. The full, detailed patch history (shows exact code added/removed per commit)
    git -C "$LATEST_SCENE/workspace" log --all -p > "$FORENSICS_DIR/full_diffs.txt"
    
    # 3. Current workspace status (catches any files the agents forgot to commit)
    git -C "$LATEST_SCENE/workspace" status > "$FORENSICS_DIR/final_status.txt"
    
    # 4. A list of all branches the agents created
    git -C "$LATEST_SCENE/workspace" branch -a > "$FORENSICS_DIR/branches.txt"
fi

# 4. Copy everything EXCEPT the actual Git repos
# -a: archive mode (preserves permissions/links)
# -v: verbose
# --exclude: skip __pycache__, the inner .git folder, and the bare remote
echo "Copying workspace and telemetry (stripping nested Git repos)..."

rsync -av \
  --exclude '__pycache__' \
  --exclude '.git' \
  --exclude 'simulated_remote.git' \
  "$LATEST_SCENE/" "$DEST_PATH/"

echo "------------------------------------------------------"
echo "Export Complete!"
echo "Location on Mac: sonex_hackfest/sandbox_runs/$SCENE_NAME"
echo "This folder contains:"
echo "  - /telemetry/events.jsonl (The full agent logic/A2A logs)"
echo "  - /workspace (The raw code state they left behind)"
echo "  - /git_forensics/*.txt (Readable logs of all their commits/diffs)"
echo "  - /inbox (The messages that triggered them)"
echo "------------------------------------------------------"