#!/bin/bash

# Install required dependencies for Chrome Headless Shell
# These are the common dependencies needed by Chrome on Linux
apt-get update
apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0

# If using Amazon Linux or other non-Debian based distro, use:
# yum update
# yum install -y nss libdrm libXcomposite libXdamage libXrandr cups-libs gtk3 pango cairo alsa-lib

echo "Chrome dependencies installed successfully!"