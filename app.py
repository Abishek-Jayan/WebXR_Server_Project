
import time
# from flask import Flask, render_template
# from flask_socketio import SocketIO, emit
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import socketio
# import eventlet
# import eventlet.wsgi
import os,json
os.environ["PYOPENGL_PLATFORM"] = "egl"
import pyrender
import OpenGL
print("OpenGL platform:", OpenGL.platform.PLATFORM)
assert 'egl' in str(OpenGL.platform.PLATFORM).lower(), "EGL backend not loaded!"


import msgpack
import msgpack_numpy as m

import ssl


import trimesh
from PIL import Image
import numpy as np
import pickle
from scipy.spatial.transform import Rotation  # For quaternion to rotation matrix
import base64
from io import BytesIO
from dotenv import load_dotenv
load_dotenv()  

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_headers=["*"],
)
# Path to the GLB file
filename = "static/BSP_TORRENS.glb"
serialized_mesh_file = "serialized_mesh.pkl"
# Initialize Socket.IO
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins='*')
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)

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

SCREEN_WIDTH = int(os.getenv("SCREEN_WIDTH"))
SCREEN_HEIGHT = int(os.getenv("SCREEN_HEIGHT"))
scene = pyrender.Scene()
mesh = pyrender.Mesh.from_trimesh(mesh)

#Sets the position of the object
mesh_initial_position = np.eye(4)
mesh_initial_position[2,3] = 3.0
mesh_initial_position[0,3] = 0


mesh_node = pyrender.Node(mesh = mesh, matrix = mesh_initial_position)


camera = pyrender.PerspectiveCamera(yfov=np.deg2rad(110), aspectRatio=SCREEN_WIDTH/SCREEN_HEIGHT)
camera_node = pyrender.Node(camera=camera)
light = pyrender.PointLight(intensity = 2.0)
light_node = pyrender.Node(light=light,matrix=np.eye(4))
scene.add_node(light_node)
scene.add_node(mesh_node)
scene.add_node(camera_node)

buffered = BytesIO()
r = pyrender.OffscreenRenderer(SCREEN_WIDTH, SCREEN_HEIGHT)

from OpenGL.GL import glGetString, GL_RENDERER, GL_VENDOR, GL_VERSION
print("GL Vendor:", glGetString(GL_VENDOR))  # Should show NVIDIA
print("GL Renderer:", glGetString(GL_RENDERER))  # Should show RTX 3090
print("GL Version:", glGetString(GL_VERSION))  # Should show modern OpenGL (e.g., 4.6)

buffered = BytesIO()



def render_scene(pose):
    start_time = time.time()
    scene.set_pose(camera_node, pose)
    rgba, _ = r.render(scene,flags=pyrender.RenderFlags.RGBA | pyrender.RenderFlags.OFFSCREEN)
    rgba_enc = msgpack.packb(rgba, default=m.encode)
    return rgba_enc


# Serve the main HTML page
@app.get("/")
def index():
    return FileResponse("templates/gltf_viewer.html")

@sio.on('connect')
async def handle_connect(sid, environ):
    print("Client connected:", sid)

@sio.on('disconnect')
async def handle_disconnect(sid):
    print("Client disconnected:", sid)


@sio.on('camera_data')
async def update_camera(sid,camera):
    print("Recieved new camera data")
    start_time = time.time()
    camera = json.loads(camera)
    pose = convert_camera_coors(camera.get("position"),camera.get("quaternion"))
    image_bytes = render_scene(pose)
    render_end = time.time()
    await sio.emit('image_update',image_bytes, to=sid)
    emit_end = time.time()
    print(f"Render time: {(render_end - start_time)*1000:.2f} ms")
    print(f"Emit time: {(emit_end - render_end)*1000:.2f} ms")
    print("Finished rendering the new scenes")


def convert_camera_coors(position,quaternion):
    position = np.array([position['x'], position['y'], -position['z']])
    quaternion = np.array([quaternion['w'], quaternion['z'], quaternion['y'], quaternion['x']]) #X and Z axes get swapped from ThreeJS to OpenGL
    pose = np.eye(4)
    pose[:3, 3] = position
    rotation = Rotation.from_quat(quaternion).as_matrix()  
    pose[:3, :3] = rotation
    return pose

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    uvicorn.run(
        "app:asgi_app",
        host="0.0.0.0",
        port=port,
        ssl_certfile="cert.pem",
        ssl_keyfile="key.pem",
    workers=1,       # force single process
    reload=False      # disable auto-reload in prod
    )