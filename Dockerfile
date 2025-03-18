FROM node:18-bullseye

# Install dependencies required for video processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libvips \
    chromium \
    fonts-noto-color-emoji \
    fonts-open-sans \
    fonts-roboto \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer/Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV REMOTION_HEADLESS=true

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy all files
COPY . .

# Create directories for output
RUN mkdir -p out

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "index.js"]