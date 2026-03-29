#!/bin/bash
set -e

HOST="${SERVER_HOST:-localhost}"

# ---------------------------------------------------------------------------
# TLS certificates
# ---------------------------------------------------------------------------
# Option 1: mount pre-generated certs via CERT_DIR (e.g. -v ./certs:/certs)
# Option 2: let this script generate a self-signed cert at container startup
if [ -d "${CERT_DIR:-/certs}" ] && \
   [ -f "${CERT_DIR:-/certs}/key.pem" ] && \
   [ -f "${CERT_DIR:-/certs}/cert.pem" ]; then
    echo "[entrypoint] Using certificates from ${CERT_DIR:-/certs}"
    cp "${CERT_DIR:-/certs}/key.pem" key.pem
    cp "${CERT_DIR:-/certs}/cert.pem" cert.pem
elif [ ! -f "key.pem" ] || [ ! -f "cert.pem" ]; then
    echo "[entrypoint] Generating self-signed certificate for CN=${HOST}"
    # Determine SAN type (IP or DNS)
    if echo "$HOST" | grep -qE '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
        SAN="IP:${HOST}"
    else
        SAN="DNS:${HOST}"
    fi
    openssl req -x509 -newkey rsa:2048 \
        -keyout key.pem -out cert.pem \
        -days 365 -nodes \
        -subj "/CN=${HOST}" \
        -addext "subjectAltName=${SAN}"
fi

# ---------------------------------------------------------------------------
# Generate env.js from environment variables
# ---------------------------------------------------------------------------
echo "[entrypoint] Writing public/env.js"
cat > /app/image_server/public/env.js << ENVEOF
export const HOSTNAME = "${HOST}";
export const NRRD_URL = "${NRRD_URL:-/static/volume.nrrd}";
export const USE_LARGE_FILE_LOADER = ${USE_LARGE_FILE_LOADER:-false};
export const MAX_SLABS = ${MAX_SLABS:-1};
export const RAYMARCH_STEPS = ${RAYMARCH_STEPS:-512};
export const RAYMARCH_THRESHOLD = ${RAYMARCH_THRESHOLD:-0.25};
export const RAYMARCH_DENSITY = ${RAYMARCH_DENSITY:-150.0};
export const RAYMARCH_GAMMA = ${RAYMARCH_GAMMA:-0.6};
export const WORLD_MAX = ${WORLD_MAX:-3};
export const INITIAL_IPD = ${INITIAL_IPD:-0.064};
export const MAX_BITRATE = ${MAX_BITRATE:-100000000};
export const MAX_FRAMERATE = ${MAX_FRAMERATE:-90};
export const RENDER_WIDTH = ${RENDER_WIDTH:-1920};
export const RENDER_HEIGHT = ${RENDER_HEIGHT:-1080};
export default HOSTNAME;
ENVEOF

# ---------------------------------------------------------------------------
# Virtual X display — gives Chrome/ANGLE an X11 connection so EGL can
# initialize.  The actual 3D rendering goes through NVIDIA's libGL (injected
# by the NVIDIA Container Toolkit); Xvfb's software framebuffer is never in
# the rendering path.
# ---------------------------------------------------------------------------
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99
# Give Xvfb a moment to be ready before Chrome tries to connect
sleep 0.5

exec "$@"
