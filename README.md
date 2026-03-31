#WebXR Server Project

This software is a Node.js-based server-side rendering (SSR) prototype for WebXR. A headless, GPU-accelerated Three.js renderer generates stereoscopic views on the server and streams them to a lightweight WebXR client using WebRTC, while pose and interaction data are exchanged over a low-bandwidth control channel (WebSocket).

**Status:** proof-of-concept. We observed lower end-to-end responsiveness under local Wi-Fi in our prototype setup; results may vary with network conditions and hardware.

## Features
- ✅ Server-side rendering for WebXR experiences (GPU backend)
- 🥽 Stereoscopic streaming to WebXR clients (WebRTC)
- 🔄 Control/interaction channel (WebSocket)
- 🔐 HTTPS support via self-signed SSL certificates
- 🧠 GPU ray-marched volume rendering of NRRD datasets (e.g. nerve cell / brain scans)
- 📦 Two NRRD loading strategies: standard NRRDLoader and chunked streaming for large files

## Repository structure
- `image_server/` — signaling + backend renderer/streamer
  - `public/client.js` — main backend client: volume loading, ray-march mesh, WebRTC streaming
  - `public/raymarch.js` — Three.js ShaderMaterial with a GLSL ray-marching fragment shader
  - `public/env.js` — hostname config (not tracked by git — see Setup)
- `vr_client/` — WebXR client for receiving streams and sending control inputs
- `comparison_studies/` — standalone traditional WebXR mode (no SSR streaming)
  - `traditional_webxr.js` — self-contained WebXR volume viewer
  - `traditional_server.js` — HTTPS static server for the comparison study

## Prerequisites
- Node.js + npm (recommended: Node 18+)
- A WebXR-capable browser on the client device
- GPU acceleration on the server is recommended for real-time performance
- Local network (Wi-Fi/LAN) recommended for best latency

## Setup (self-signed HTTPS)

Generate certificates (run in the repo root):

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

Move `key.pem` and `cert.pem` into `image_server/`.

### env.js

Create `image_server/public/env.js` (this file is gitignored — never commit it). This is the single place to configure all tunable constants for the entire project:

```js
// ── Network ───────────────────────────────────────────────────────────────
export const HOSTNAME = "your.server.ip.or.hostname";

// ── Volume data ───────────────────────────────────────────────────────────
export const NRRD_URL = "./static/paper_datasets/true_datasets/your_file.nrrd";
export const USE_LARGE_FILE_LOADER = false; // true = chunked streaming, false = NRRDLoader

// ── Render resolution ─────────────────────────────────────────────────────
export const RENDER_WIDTH = 1920;
export const RENDER_HEIGHT = 1080;

// ── Volume slabs ──────────────────────────────────────────────────────────
export const MAX_SLABS = 8;

// ── Ray march shader tuning ───────────────────────────────────────────────
export const RAYMARCH_STEPS = 512;       // samples per ray — higher = sharper, more GPU cost
export const RAYMARCH_THRESHOLD = 0.25;  // voxels below this are discarded (cuts background fog)
export const RAYMARCH_DENSITY = 150.0;   // opacity scale — raise to make thin fibers visible
export const RAYMARCH_GAMMA = 0.6;       // power applied to remapped value — lower boosts dim structures

// ── Scene ─────────────────────────────────────────────────────────────────
export const WORLD_MAX = 3;       // volume size in world units
export const INITIAL_IPD = 0.064; // interpupillary distance in metres

// ── WebRTC ────────────────────────────────────────────────────────────────
export const MAX_BITRATE = 100_000_000; // 100 Mbps
export const MAX_FRAMERATE = 90;
```

This file is imported by `image_server/public/client.js`, `image_server/public/raymarch.js`, `comparison_studies/traditional_webxr.js`, `image_server/server.js`, `vr_client/server.js`, and `vr_client/public/client.js`.

### Immersive Web Emulator (for Puppeteer/headless VR)

Puppeteer does not support VR natively. Download the **Immersive-Web-Emulator** Chrome extension as an unpacked folder and place it inside `image_server/`.

## Running with Docker (recommended)

Docker Compose handles everything — Node.js, Chrome, GPU drivers, certificates, and env config.

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/)
- NVIDIA GPU + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

### Run

```bash
sudo NRRD_FILE=/any/path/on/your/machine/file.nrrd docker compose up --build
```

`NRRD_FILE` can point to any `.nrrd` file anywhere on your system — it is mounted directly into the container. No need to copy files into the project directory.

Optional overrides:

| Variable | Default | Description |
|----------|---------|-------------|
| `NRRD_FILE` | *(required)* | Full path to the `.nrrd` file on the host |
| `IMAGE_SERVER_PORT` | `3001` | Renderer + signaling server port |
| `VR_CLIENT_PORT` | `3000` | VR client static server port |

Example with overrides:
```bash
sudo NRRD_FILE=/home/user/scans/brain.nrrd docker compose up
```

Open the client on the Quest browser:
```
https://<server-ip>:3000
```

> Because the certificate is self-signed, your browser/device will require a one-time "Proceed / Advanced" trust step.

---

## Install + Run (without Docker)

Install dependencies:

```bash
cd image_server && npm install
cd ../vr_client && npm install
```

Start both services (two terminals):

### Terminal 1 — backend renderer/streamer
```bash
cd image_server && npm start
```

### Terminal 2 — VR client
```bash
cd vr_client && npm start
```

Open the client in a browser:
```
https://<server-ip>:3000
```

> Because the certificate is self-signed, your browser/device will require a one-time "Proceed / Advanced" trust step.

## Volume Rendering

This software ray-marches NRRD volumetric datasets (e.g. brain MRI, nerve cell scans) inside a Three.js `BoxGeometry` using a custom GLSL shader (`raymarch.js`).

### Loading strategies

`client.js` and `traditional_webxr.js` support two loaders, toggled by a single flag at the top of each file:

```js
const USE_LARGE_FILE_LOADER = false; // false = NRRDLoader (default), true = chunked streaming
```

| Mode | When to use |
|------|-------------|
| `false` — NRRDLoader | Small/medium NRRD files that fit in browser memory |
| `true` — chunked streaming | Large files (>1.5 GB uncompressed); streams gzip-compressed chunks and decompresses on the fly |

### Shader tuning

Key constants in `raymarch.js` that control visual quality:

| Constant | Default | Effect |
|----------|---------|--------|
| `STEPS` | `512` | Ray samples per pixel — higher = sharper but more GPU cost |
| `THRESHOLD` | `0.25` | Voxels below this are discarded — raise to cut fog, lower to show more tissue |
| `DENSITY` | `150.0` | Opacity scale — raise to make thin fibers visible, lower if structures merge |
| gamma | `0.6` | Power applied to remapped value — lower boosts dim structures |

The shader uses **front-to-back alpha compositing** with early ray termination, so dense structures occlude background fog naturally.

## Comparison Studies

`comparison_studies/` contains a standalone traditional WebXR mode for benchmarking against the SSR approach.

### Running the comparison study

```bash
cd comparison_studies && npm install
node traditional_server.js
```

Then open `https://<server-ip>:3001` on a WebXR device. No streaming or Puppeteer required — the volume is rendered directly in the headset's browser.

The same NRRD loading toggle (`USE_LARGE_FILE_LOADER`) is available in `traditional_webxr.js`.

## Utilities

`utilities/` contains Python scripts for processing performance log files generated during experiments.

| Script | Usage | Description |
|--------|-------|-------------|
| `extractvals.py` | `python extractvals.py <log_file>` | Extracts and prints all backend FPS, client video FPS, bandwidth, and input→photon latency values from a log file. Defaults to `logs/v2/1_v2.log` if no argument given. |
| `datacleaner.py` | `python datacleaner.py <input> <output> [threshold_mbps]` | Filters out log paragraphs where bandwidth exceeds a threshold (default 50 Mbps) and writes the cleaned log to an output file. Useful for removing network-spike outliers before analysis. |
| `average_calc.py` | `python average_calc.py` | Interactive — enter space-separated numbers, prints their average. Quick helper for manual metric averaging. |

## Limitations / Notes

- Designed and tested primarily under local/controlled Wi-Fi.

- This system supports 3DoF rotational look-around via spherical video sampling with stereo disparity. Translation is supported as a navigation/locomotion metaphor (not positional-parallax-correct 6DoF view synthesis).

- Not production-hardened (no authentication, TURN deployment guidance, etc.).
