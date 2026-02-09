# VorteXR

A NodeJS-based server-side VR rendering system using WebRTC to offload WebXR computation.

## Features

- ✅ Server-side rendering for WebXR experiences  
- 🔄 Real-time communication via WebSockets  
- 🔐 HTTPS support via self-signed SSL certificates  
- 📉 Frame latency reduced by 70% for smoother VR experiences  

---

## Setup Instructions
-  Need to set up SSL certificates for self signing for the https server to work. Generate certificate using this command ```openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes```

- Move those cert.pem and key.pem files into image_server.

- Go into each folder (ie, image_server and vr_client) and run ```npm install``` on each.


- Then run npm start on each folder and navigate to ```your_external_ip:3000``` on your browser to view the VR session. 