#!/usr/bin/env bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y git curl postgresql postgresql-contrib
sudo systemctl enable postgresql
