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

# Socket.IO event handler for model updates
@socketio.on("update_model")
def handle_update(data):
    """Handle vertex updates from the client."""
    modified_data = modify_vertices(data["vertices"])
    emit("update_client", {"vertices": modified_data}, broadcast=True)

def modify_vertices(data):
    """Apply PyTorch-based transformations to vertices."""
    tensor_data = torch.tensor(data, dtype=torch.float32)
    tensor_data *= 1.5  # Example: Scale up the vertices
    return tensor_data.tolist()

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
    """Process the GLB file and modify it every second."""
    global current_scale
    while True:
        try:
            gltf = GLTF2().load(modified_filename if os.path.exists(modified_filename) else filename)
            mesh = gltf.meshes[gltf.scenes[gltf.scene].nodes[0]]

            for primitive in mesh.primitives:
                accessor = gltf.accessors[primitive.attributes.POSITION]
                buffer_view = gltf.bufferViews[accessor.bufferView]
                buffer = gltf.buffers[buffer_view.buffer]
                data = gltf.get_data_from_buffer_uri(buffer.uri)

                vertices = []
                for i in range(accessor.count):
                    index = buffer_view.byteOffset + accessor.byteOffset + i * 12
                    d = data[index:index + 12]
                    v = list(struct.unpack("<fff", d))
                    vertices.append(v)


                # Update current scale factor (e.g., increase by 0.05 each time)
                current_scale += 0.05
                # Or use an oscillating factor: current_scale = 1.0 + 0.5 * math.sin(time.time())
                modified_vertices = []
                for v in vertices:
                    modified_vertices.append([x * current_scale for x in v])



                # Update buffer data with modified vertices
                new_data = bytearray(data)
                for i, v in enumerate(modified_vertices):
                    index = buffer_view.byteOffset + accessor.byteOffset + i * 12
                    new_data[index:index + 12] = struct.pack("<fff", *v)
                buffer.data = new_data

            # Save modified GLB
            gltf.save(modified_filename)

            # Emit the updated GLB file to clients
            with open(modified_filename, "rb") as f:
                socketio.emit("update_model", {"glb_data": f.read()})

        except Exception as e:
            print(f"Error processing GLB: {e}")

        time.sleep(1)  # Wait 1 second before updating again


# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

threading.Thread(target=process_glb, daemon=True).start()
if __name__ == "__main__":
    socketio.run(app, debug=True)