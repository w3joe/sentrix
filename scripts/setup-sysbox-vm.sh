#!/bin/bash
# Setup an Ubuntu 22.04 VM via Multipass with Docker and Sysbox, mount the repo,
# and drop into a shell so you can run the sandbox with: cd $VM_MOUNT_DIR && sg docker -c 'docker compose up'
# Requires: run this from the sonex_hackfest repo root.

set -e

VM_NAME="sandbox-vm"
REPO_DIR=$(pwd)
VM_MOUNT_DIR="/home/ubuntu/sonex_hackfest"

echo "Checking for Multipass..."
if ! command -v multipass &> /dev/null; then
    echo "Multipass is not installed. Installing via Homebrew..."
    brew install --cask multipass
fi

echo "Launching Ubuntu 22.04 VM ($VM_NAME) with 4GB RAM and 20GB disk..."
if multipass list --format csv 2>/dev/null | grep -q "^$VM_NAME,"; then
    echo "VM already exists. Ensuring it is started..."
    multipass start "$VM_NAME" || true
else
    multipass launch 22.04 --name "$VM_NAME" --memory 4G --disk 20G
fi

echo "Mounting current directory into the VM..."
multipass mount "$REPO_DIR" "$VM_NAME:$VM_MOUNT_DIR"

echo "Installing Docker inside the VM..."
multipass exec "$VM_NAME" -- sudo apt-get update -qq
multipass exec "$VM_NAME" -- sudo apt-get install -y -qq curl wget jq
multipass exec "$VM_NAME" -- bash -c 'if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sudo sh; fi'
multipass exec "$VM_NAME" -- sudo usermod -aG docker ubuntu

echo "Installing Sysbox inside the VM..."
multipass exec "$VM_NAME" -- bash -c '
    if ! command -v sysbox-runc >/dev/null 2>&1; then
        wget -q https://downloads.nestybox.com/sysbox/releases/v0.6.4/sysbox-ce_0.6.4-0.linux_amd64.deb -O /tmp/sysbox.deb
        sudo dpkg -i /tmp/sysbox.deb || sudo apt-get install -f -y
        rm -f /tmp/sysbox.deb
    else
        echo "Sysbox is already installed."
    fi
'

echo ""
echo "------------------------------------------------------"
echo "Setup complete. Dropping you into the VM shell."
echo ""
echo "Once inside, run:"
echo "  cd $VM_MOUNT_DIR"
echo "  export GEMINI_API_KEY=\"your-api-key\"   # if not already set"
echo "  sg docker -c 'docker compose up'"
echo "------------------------------------------------------"
echo ""

multipass shell "$VM_NAME"
