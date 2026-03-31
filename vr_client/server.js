const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const HOSTNAME = process.env.SERVER_HOST || '0.0.0.0';

const app = express();
app.get('/env.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
export const HOSTNAME = ${JSON.stringify(process.env.SERVER_HOST)};
export const IMAGE_SERVER_PORT = ${parseInt(process.env.IMAGE_SERVER_PORT)};
export const VR_CLIENT_PORT = ${parseInt(process.env.VR_CLIENT_PORT)};
  `.trim());
});



// serve static files
app.use(express.static(__dirname + '/public'));
app.use('/build/', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/jsm/', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/image_server/public', express.static(path.join(__dirname, '../image_server/public')));
app.use('/logging/', express.static(path.join(__dirname, '../logging')));

// read your self-signed cert + key
const options = {
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem")
};

// create HTTPS server
const PORT = parseInt(process.env.VR_CLIENT_PORT) || 3000;
https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on https://${HOSTNAME}:${PORT}`);
});

