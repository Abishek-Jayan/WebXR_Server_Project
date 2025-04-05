
import time
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import eventlet
import eventlet.wsgi
import os,json
os.environ["PYOPENGL_PLATFORM"] = "egl"

import pyrender
import trimesh
from PIL import Image
import numpy as np
import pickle
from scipy.spatial.transform import Rotation  # For quaternion to rotation matrix
import base64
from io import BytesIO

app = Flask(__name__)
# Path to the GLB file
filename = "static/scifi_girl_v.01.glb"
serialized_mesh_file = "serialized_mesh.pkl"

# Initialize Socket.IO
socketio = SocketIO(app, async_mode = 'eventlet', cors_allowed_origins='*')


# Ensure the GLB file exists
if not os.path.exists(filename):
    raise FileNotFoundError(f"GLB file not found at {filename}")

if os.path.exists(serialized_mesh_file):
    with open(serialized_mesh_file, 'rb') as f:
        mesh = pickle.load(f)
else:
    mesh = trimesh.load_mesh(filename)

with open(serialized_mesh_file, 'wb') as f:
    pickle.dump(mesh,f)

SCREEN_WIDTH = 320
SCREEN_HEIGHT = 180
scene = pyrender.Scene()
mesh = pyrender.Mesh.from_trimesh(mesh)
mesh_node = pyrender.Node(mesh = mesh, matrix = np.eye(4))
camera = pyrender.PerspectiveCamera(yfov=np.pi/3.0, aspectRatio=SCREEN_WIDTH/SCREEN_HEIGHT)
camera_node = pyrender.Node(camera=camera)
camera_node.matrix = np.array([
    [1, 0, 0, 0],
    [0, 1, 0, 1],
    [0, 0, 1, 5],  # Move the camera 5 units back and 1 unit up
    [0, 0, 0, 1]
])
initial_pose = np.array([
    [1, 0, 0, 0],
    [0, 1, 0, 1],
    [0, 0, 1, 5],  # Move the camera 5 units back and 1 unit up
    [0, 0, 0, 1]
])
light = pyrender.PointLight(intensity = 2.0)
light_node = pyrender.Node(light=light,matrix=np.eye(4))
scene.add_node(light_node)
scene.add_node(mesh_node)
scene.add_node(camera_node)

buffered = BytesIO()
r = pyrender.OffscreenRenderer(SCREEN_WIDTH, SCREEN_HEIGHT)
buffered = BytesIO()
last_emit_time = 0
MIN_INTERVAL = 0.033  # ~30 Hz (33 ms)

def render_scene(pose, eye_offset = 0.0):
    start_time = time.time()
    adjusted_pose = pose.copy()
    adjusted_pose[0,3] += eye_offset
    scene.set_pose(camera_node, adjusted_pose)
    color, _ = r.render(scene)
    rgba = np.concatenate([color, np.full((color.shape[0], color.shape[1], 1), 255, dtype=np.uint8)], axis=2)
    end_time = time.time()
    print(f"render_scene time (eye_offset={eye_offset}): {(end_time - start_time)*1000:.2f} ms")
    return rgba.tobytes()


# Serve the main HTML page
@app.route("/")
def index():
    initial_rgb = render_scene(initial_pose)  # Returns raw RGBA bytes
    initial_rgba = np.frombuffer(initial_rgb, dtype=np.uint8).reshape(SCREEN_HEIGHT, SCREEN_WIDTH, 4)
    import base64
    img = Image.fromarray(initial_rgba)
    img.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')  # Convert to base64
    return render_template('gltf_viewer.html', initial_image=img_base64)

@socketio.on('connect')
def handle_connect():
    print("Client connected:")

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected:")


@socketio.on('camera_data')
def update_camera(camera):
    print("Recieved new camera data")
    global last_emit_time
    current_time = time.time()
    if current_time - last_emit_time < MIN_INTERVAL:
        return  # Skip if too soon
    camera = json.loads(camera)
    print("Camera pos: "+str(camera.get("position")) + "\n Camera quaternion: "+ str(camera.get("quaternion")))
    
    # Extract position and quaternion
    position = camera.get("position")
    quaternion = camera.get("quaternion")
    start_time = time.time()
    pose = convert_camera_coors(position,quaternion)
    end_time = time.time()
    print(f"Camera Coordinates conversion from frontend to backend: {(end_time - start_time)*1000:.2f} ms")
    left_future = eventlet.spawn(render_scene,pose,-0.03)
    right_future = eventlet.spawn(render_scene,pose,0.03)
    left_img_str = left_future.wait()
    right_img_str = right_future.wait()
    socketio.emit('image_update', {'left_image': left_img_str, 'right_image': right_img_str})
    print("Finished rendering the new scenes")
    last_emit_time = current_time


def convert_camera_coors(position,quaternion):
    position = np.array([position['x'], position['y'], -position['z']])
    quaternion = np.array([quaternion['w'], quaternion['x'], quaternion['y'], quaternion['z']])
    pose = np.eye(4)
    pose[:3, 3] = position
    # Convert quaternion to rotation matrix and set it in the pose matrix
    rotation = Rotation.from_quat(quaternion).as_matrix()  # Convert quaternion to 3x3 rotation matrix
    pose[:3, :3] = rotation
    return pose


# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    # Wrap with eventlet WSGI server and SSL
    listener = eventlet.listen(('0.0.0.0', port))
    listener = eventlet.wrap_ssl(listener, certfile='cert.pem', keyfile='key.pem', server_side=True, ciphers='ECDHE-RSA-AES128-GCM-SHA256')
    eventlet.wsgi.server(listener, app)