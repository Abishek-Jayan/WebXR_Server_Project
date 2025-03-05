from flask import Flask, render_template, request, jsonify, Response
from flask_socketio import SocketIO, emit
from pygltflib import GLTF2
import torch
import struct
import threading
import time
import numpy as np
import os

app = Flask(__name__)

# Path to the GLB file
filename = "static/scifi_girl_v.01.glb"
modified_filename = "static/modified_scifi_girl_v.01.glb"

# Initialize Socket.IO
socketio = SocketIO(app, cors_allowed_origins="*")

# Ensure the GLB file exists
if not os.path.exists(filename):
    raise FileNotFoundError(f"GLB file not found at {filename}")

# Serve the main HTML page
@app.route("/")
def index():
    return render_template("gltf_viewer.html")

# Serve the GLB file directly
@app.route("/model")
def get_model():
    """Serve the GLB file to the client."""
    try:
        with open(filename, "rb") as f:
            return Response(f.read(), mimetype="model/gltf-binary")
    except FileNotFoundError:
        return jsonify({"error": "Model not found"}), 404

current_scale = 1.0  # Global variable outside process_glb

# Process the GLB file and return modified vertices
def process_glb():
    pass


# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

if __name__ == "__main__":
    socketio.run(app, debug=True)