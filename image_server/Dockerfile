FROM nvidia/opengl:1.2-glvnd-runtime-ubuntu22.04

# Suppress interactive apt prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 22 + Vulkan ICD + Chrome system deps in one layer
RUN apt-get update && apt-get install -y curl ca-certificates --no-install-recommends \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y \
    nodejs \
    libvulkan1 \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    openssl \
    wget \
    xdg-utils \
    xvfb \
    unzip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/image_server

# Download the Immersive Web Emulator Chrome extension (v1.5.0)
RUN wget -q https://github.com/meta-quest/immersive-web-emulator/releases/download/v1.3.0/iwe-v1.3.0.zip \
    -O /tmp/iwe.zip \
    && unzip -q /tmp/iwe.zip -d /tmp/iwe \
    && mv /tmp/iwe Immersive-Web-Emulator-Chrome-Web-Store \
    && rm /tmp/iwe.zip

# Install dependencies — Puppeteer downloads Chrome for Testing here (~400 MB)
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Create logs directory (mounted at runtime)
RUN mkdir -p /app/logs

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
