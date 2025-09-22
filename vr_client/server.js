const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

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

// create HTTPS server
https.createServer(options, app).listen(3000, '0.0.0.0', () => {
  console.log('Server running on https://<your-pc-ip>:3000');
});

