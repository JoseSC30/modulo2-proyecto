#!/bin/bash
set -eu

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes python3 python3-apt
