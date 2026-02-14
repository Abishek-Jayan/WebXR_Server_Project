# VorteXR

VorteXR is a Node.js-based server-side rendering (SSR) prototype for WebXR. A headless, GPU-accelerated Three.js renderer generates stereoscopic views on the server and streams them to a lightweight WebXR client using WebRTC, while pose and interaction data are exchanged over a low-bandwidth control channel (WebSocket).

**Status:** proof-of-concept. We observed lower end-to-end responsiveness under local Wi-Fi in our prototype setup; results may vary with network conditions and hardware.

## Features
- ✅ Server-side rendering for WebXR experiences (GPU backend)
- 🥽 Stereoscopic streaming to WebXR clients (WebRTC)
- 🔄 Control/interaction channel (WebSocket)
- 🔐 HTTPS support via self-signed SSL certificates

## Repository structure
- `image_server/` — signaling + backend renderer/streamer
- `vr_client/` — WebXR client for receiving streams and sending control inputs

## Prerequisites
- Node.js + npm (recommended: Node 18+)
- A WebXR-capable browser on the client device
- GPU acceleration on the server is recommended for real-time performance
- Local network (Wi-Fi/LAN) recommended for best latency

## Setup (self-signed HTTPS)

- Generate certificates (you can run this in the repo root):

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```
- Move key.pem and cert.pem into: image_server/

IMPORTANT NOTES:-
- Puppeteer by default does not support VR. Download the Immersive-Web-Emulator-Chrome-Web-Store extension as a folder from the Chrome WebStore and move it into image_server/
- Also define an env.js somewhere in the codebase, define your public HOSTNAME there and then import it to image_server/public/client.js, image_server/server.js, vr_client/server.js, vr_client/public/client.js
## Install + Run

- Install dependencies in both folders:
``` bash
cd image_server && npm install
cd ../vr_client && npm install
```
- Start both services (in two terminals):

### Terminal 1
```bash
cd image_server && npm start
```
### Terminal 2
```bash
cd vr_client && npm start
```
- Open the client in a browser:
```bash
https://<server-ip>:3000
```
Note: because the certificate is self-signed, your browser/device may require a one-time “Proceed / Advanced” trust step.

## Limitations / Notes

- Designed and tested primarily under local/controlled Wi-Fi.

- This system supports 3DoF rotational look-around via spherical video sampling with stereo disparity. Translation is supported as a navigation/locomotion metaphor (not positional-parallax-correct 6DoF view synthesis).

- Not production-hardened (no authentication, TURN deployment guidance, etc.).