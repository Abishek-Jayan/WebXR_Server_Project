const express = require("express");
const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = 3001;

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

wss.on("connection", (ws, req) => {
  console.log("New WebSocket connection");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.role === "streamer") {
      streamerSocket = ws;
      console.log("Streamer registered");
    } else if (data.role === "headset") {
      headsetSocket = ws;
      console.log("Headset registered");
    }

    // relay signaling messages
    if (data.type === "offer" && headsetSocket) {
      headsetSocket.send(JSON.stringify(data));
    }
    if (data.type === "answer" && streamerSocket) {
      streamerSocket.send(JSON.stringify(data));
    }
    if (data.type === "candidate") {
      if (ws === streamerSocket && headsetSocket) {
        headsetSocket.send(JSON.stringify(data));
      } else if (ws === headsetSocket && streamerSocket) {
        streamerSocket.send(JSON.stringify(data));
      }
    }
  });

  ws.on("close", () => {
    if (ws === streamerSocket) streamerSocket = null;
    if (ws === headsetSocket) headsetSocket = null;
  });
});
const os = require("os");

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}
server.listen(PORT, "0.0.0.0", async () => {
  const host = getLocalIp();
  console.log(`Streamer server running on https://0.0.0.0:${PORT}`);
  console.log(`WebSocket address: wss://${host}:${PORT}`);

  const browser = await puppeteer.launch({
    ignoreHTTPSErrors: true,
    headless: true,
    args: [
      "--enable-gpu",
      "--no-sandbox",
      "--use-angle=vulkan",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
    ],
  });

  // open your Three.js streamer page
  await browser.newPage().then((page) =>
    page.goto(`https://localhost:${PORT}/public/streamer.html`)
  );
});
