const express = require("express");
const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");
const path = require('path');

const PORT = 3000;

const app = express();

// serve static files
app.use(express.static(__dirname + '/public'));
app.use('/build/', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/jsm/', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));

// read your self-signed cert + key
const options = {
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem")
};

const server = https.createServer(options, app);


server.listen(PORT, '0.0.0.0', async () => {
  const browser = await puppeteer.launch({
    ignoreHTTPSErrors: true,
    headless: true,
    args: [
      "--enable-gpu",
      "--no-sandbox",
      "--use-angle=vulkan",
      "--ignore-certificate-errors",     // extra flag
      "--ignore-certificate-errors-spki-list"
    ]
  });
  const page = await browser.newPage();

  // Pipe console logs from the browser to your Node console
  page.on("console", msg => {
    console.log("PAGE LOG:", msg.type(), msg.text());
  });

  // Catch errors thrown in the page
  page.on("pageerror", err => {
    console.error("PAGE ERROR:", err.message);
  });

  // Catch failed requests
  page.on("requestfailed", req => {
    console.error("REQUEST FAILED:", req.url(), req.failure()?.errorText);
  });



  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto("https://localhost:3000");
  await new Promise(r => { setTimeout(r, 20000); console.log("Screenshot was taken"); });
  await page.screenshot({
    type: "jpeg",
    path: "./gpu.jpg"
  });
  await browser.close();
  server.close();
});