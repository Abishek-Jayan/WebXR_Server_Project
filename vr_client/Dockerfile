FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    openssl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# vr_client/server.js references ../image_server/public/env and ../logging/
# so the container mirrors the project layout under /app/
WORKDIR /app/vr_client

# Install vr_client dependencies
COPY vr_client/package*.json ./
RUN npm install

# Copy vr_client source
COPY vr_client/ .

# Copy shared logging utilities (served at /logging/ path)
COPY logging/ /app/logging/

# Directory for the env.js that server.js imports via ../image_server/public/env
RUN mkdir -p /app/image_server/public

COPY vr_client/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
