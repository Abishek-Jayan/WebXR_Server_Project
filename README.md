# VorteXR

A Flask-based server-side VR rendering system using WebSockets to offload WebXR computation. This system reduces frame latency by up to **70%** (from 130ms to 25ms) across 100 tested sessions, enabling **platform-agnostic**, low-latency VR experiences on **low-end devices**.

## Features

- ✅ Server-side rendering for WebXR experiences  
- 🔄 Real-time communication via WebSockets  
- 🔐 HTTPS support via self-signed SSL certificates  
- 🐳 Docker support for containerized deployment  
- 📉 Frame latency reduced by 70% for smoother VR experiences  

---

## Setup Instructions
-  Need to set up SSL certificates for self signing for the https server to work. Generate certificate using this command ```openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes```
- Set up a python virtual environment, then run the app file using python app.py (This runs the file locally)
- To set up docker server ```sudo docker build -t flask-app .  ``` then ``` sudo docker run --gpus all -p 5000:5000 flask-app   ```

In case there are errors with egl, just run ```pip install pyopengl==3.1.9```