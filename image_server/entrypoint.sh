#!/bin/bash
set -e

HOST="${SERVER_HOST:-localhost}"

# ---------------------------------------------------------------------------
# TLS certificates
# Generate once into CERT_DIR (mounted volume) so certs persist across
# restarts and are shared with vr_client via the same volume mount.
# ---------------------------------------------------------------------------
CERT_DIR="${CERT_DIR:-/certs}"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/key.pem" ] && [ -f "$CERT_DIR/cert.pem" ]; then
    echo "[entrypoint] Using certificates from ${CERT_DIR}"
else
    echo "[entrypoint] Generating self-signed certificate into ${CERT_DIR}"
    openssl req -x509 -newkey rsa:2048 \
        -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
        -days 365 -nodes \
        -subj "/"
fi

cp "$CERT_DIR/key.pem" key.pem
cp "$CERT_DIR/cert.pem" cert.pem

# ---------------------------------------------------------------------------
# Generate env.js from environment variables
# ---------------------------------------------------------------------------
echo "[entrypoint] Writing public/env.js"
cat > /app/image_server/public/env.js << ENVEOF
export const HOSTNAME = "${HOST}";
export const IMAGE_SERVER_PORT = ${IMAGE_SERVER_PORT:-3001};
export const NRRD_URL = "/static/volume.nrrd";
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
