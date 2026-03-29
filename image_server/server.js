const express = require("express");
const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const os = require("os");
const { default: HOSTNAME } = require("./public/env");

const PORT = 3001;

const sessionTs = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const LOG_FILE = path.join(__dirname, '..', 'logs', `session_${sessionTs}.log`);
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

const _lastLogTime = {};
const LOG_THROTTLE_MS = 2000;

function writeLog(source, text) {
  if (text.includes('[LATENCY BREAKDOWN]')) {
    const key = `${source}:latency`;
    const now = Date.now();
    if (now - (_lastLogTime[key] || 0) < LOG_THROTTLE_MS) return;
    _lastLogTime[key] = now;
  }
  const ts = new Date().toISOString();
  fs.appendFile(LOG_FILE, `[${ts}] [${source}] ${text}\n`, () => {});
}

const app = express();

// serve static files
app.use(express.static(__dirname + "/public"));
app.use("/build/", express.static(path.join(__dirname, "node_modules/three/build")));
app.use("/jsm/", express.static(path.join(__dirname, "node_modules/three/examples/jsm")));

// read your self-signed cert + key
const options = {
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem"),
};

const server = https.createServer(options, app);

// attach websocket server
const wss = new WebSocketServer({ server });

let streamerSocket = null;
let headsetSocket = null;
let pendingOffer = null;
wss.on("connection", (ws, req) => {
  console.log("WS connected:", req.socket.remoteAddress, "id=", Date.now());
  ws.role = null;
  ws.on("message", (msg) => {
    let data = JSON.parse(msg);
    if (data.role && !ws.role) {
      ws.role = data.role; // "streamer" or "headset"
    if (ws.role === "streamer") {
      streamerSocket = ws;
      console.log("Streamer registered");
      if (headsetSocket && pendingOffer) {
          console.log("Sending queued offer to headset");
          headsetSocket.send(JSON.stringify(pendingOffer));
          pendingOffer = null;
        }
    } else if (data.role === "headset") {
      headsetSocket = ws;
      console.log("Headset registered");
      if (pendingOffer) {
          console.log("Sending queued offer to headset");
          headsetSocket.send(JSON.stringify(pendingOffer));
          pendingOffer = null;
        }
      if (streamerSocket) {
        streamerSocket.send(JSON.stringify({ type: "headset_joined" }));
      }
    }
    return;
  }
    if (data.type === "onehand" && streamerSocket) {
      streamerSocket.send(JSON.stringify(data));
    }
    if (data.type === "transform" && streamerSocket) {
      streamerSocket.send(JSON.stringify(data));
    }
    if ((data.type === "left" || data.type === "right") && streamerSocket)
    {
      streamerSocket.send(JSON.stringify(data));
    }
    if (data.type === "pose" && streamerSocket) {
      streamerSocket.send(JSON.stringify(data));
    }
    if (data.move && streamerSocket) {
      streamerSocket.send(JSON.stringify(data));
    }
    // relay signaling messagesR
    if (data.type === "offer") {
      if (headsetSocket) {
        console.log("Recieved offer from streamer, forwarding it to headset");
        headsetSocket.send(JSON.stringify(data));
      } else {
        console.log("Headset not connected, queuing offer");
        pendingOffer = data;
      }
      return;
    }

    if (data.type === "answer" && streamerSocket) {
      console.log("Recieved offer from headset, forwarding it to streamer");
      streamerSocket.send(JSON.stringify(data));
    }
    if (data.type === "render_ack" && headsetSocket) {
      headsetSocket.send(JSON.stringify(data));
    }
    if (data.type === "candidate") {
      if (ws.role === "streamer" && headsetSocket) {
    headsetSocket.send(JSON.stringify(data));
  } else if (ws.role === "headset" && streamerSocket) {
    streamerSocket.send(JSON.stringify(data));
  }
  return;
    }

    if (data.type === "log") {
      writeLog('vr-client', data.msg);
      return;
    }

  });

  ws.on("close", () => {
    console.log("WS closed. Was streamer?", ws === streamerSocket, "Was headset?", ws === headsetSocket);
    if (ws === streamerSocket) streamerSocket = null;
    if (ws === headsetSocket) headsetSocket = null;
  });
});

const pathToExtension = path.join(__dirname, "Immersive-Web-Emulator-Chrome-Web-Store");


server.listen(PORT, "0.0.0.0", async () => {
  console.log(`Streamer server running on https://${HOSTNAME}:${PORT}`);

  const browser = await puppeteer.launch({
    browser: "chrome",
    acceptInsecureCerts: true, //DO NOT CHANGE THIS
    headless: true,
    pipe: true,
    devtools: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-gpu-blocklist",   // Bypass Chrome's GPU blocklist in container envs
      "--disable-gpu-sandbox",    // Required for GPU access inside containers
      "--use-angle=vulkan",       // ANGLE uses NVIDIA Vulkan directly (bypasses X11/GLX)
      "--js-flags=--max_old_space_size=8192",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  // open your Three.js streamer page
  await browser.newPage().then((page) =>{
      page.on("console", (msg) => {
    const text = msg.text();
    console.log(`📢 [Browser] ${msg.type()}: ${text}`);
    writeLog('image-server', text);
  });

  page.on("pageerror", (err) => {
    console.error("🔥 [Browser Error]", err);
  });
  page.on("requestfailed", (req) => {
    console.error("❌ [Request failed]", req.url(), req.failure().errorText);
  });
  page.goto(`https://localhost:${PORT}/`)
  }
  );
});
