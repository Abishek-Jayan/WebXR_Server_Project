# WEBXR_SERVER_PROJECT
-  Need to set up SSL certificates for self signing for the https server to work. Generate certificate using this command ```openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes```
- Set up a python virtual environment, then run the app file using python app.py (This runs the file locally)
- To set up docker server ```sudo docker build -t flask-app .  ``` then ``` sudo docker run --gpus all -p 5000:5000 flask-app   ```

In case there are errors with egl, just run ```pip install pyopengl==3.1.9```