from flask import Flask, render_template, request, jsonify, Response,send_file
from flask_socketio import SocketIO, emit
from pygltflib import GLTF2
import pyrender
import trimesh
from PIL import Image
import numpy as np
import os
import pickle

app = Flask(__name__)

# Path to the GLB file
filename = "static/scifi_girl_v.01.glb"
output_dir = "output_images"
serialized_mesh_file = "serialized_mesh.pkl"

# Initialize Socket.IO
# socketio = SocketIO(app, cors_allowed_origins="*")

# Ensure the GLB file exists
if not os.path.exists(filename):
    raise FileNotFoundError(f"GLB file not found at {filename}")
os.makedirs(output_dir, exist_ok=True)




os.makedirs(output_dir, exist_ok=True)

# Serve the main HTML page
@app.route("/")
def index():
    if os.path.exists(serialized_mesh_file):
        with open(serialized_mesh_file, 'rb') as f:
            mesh = pickle.load(f)
    else:
        mesh = trimesh.load_mesh(filename)

    with open(serialized_mesh_file, 'wb') as f:
        pickle.dump(mesh,f)

    scene = pyrender.Scene()
    mesh = pyrender.Mesh.from_trimesh(mesh)
    mesh_node = pyrender.Node(mesh = mesh, matrix = np.eye(4))
    camera = pyrender.PerspectiveCamera(yfov=np.pi/3.0, aspectRatio=1.414)
    camera_node = pyrender.Node(camera=camera)
    camera_node.matrix = np.array([
        [1, 0, 0, 0],
        [0, 1, 0, 1],
        [0, 0, 1, 5],  # Move the camera 5 units back
        [0, 0, 0, 1]
    ])
    light = pyrender.PointLight(intensity = 2.0)
    light_node = pyrender.Node(light=light,matrix=np.eye(4))
    scene.add_node(camera_node)
    scene.add_node(light_node)
    scene.add_node(mesh_node)
    # pyrender.Viewer(scene)

    # # Render the scene
    r = pyrender.OffscreenRenderer(640, 480)
    color, _ = r.render(scene)
    # # Save the rendered image
    image = Image.fromarray(color)
    image.save(os.path.join(output_dir, "rendered_model.png"))
    return send_file(output_dir+"/rendered_model.png",mimetype='image/png')


# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

if __name__ == "__main__":
    app.run()