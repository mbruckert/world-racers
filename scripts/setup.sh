#!/bin/bash

set -e

# Update package lists
sudo apt-get update

# Install pkg-config
sudo apt-get install -y pkg-config

# Install openssl
sudo apt-get install -y libssl-dev

# Install sea-orm-cli
cargo install sea-orm-cli