import time

# from flask import Flask, render_template
# from flask_socketio import SocketIO, emit
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from av import VideoFrame
import cv2
import numpy as np
from fractions import Fraction
import time

# import eventlet
# import eventlet.wsgi
import os, json

os.environ["PYOPENGL_PLATFORM"] = "egl"
import pyrender
import OpenGL

print("OpenGL platform:", OpenGL.platform.PLATFORM)
assert "egl" in str(OpenGL.platform.PLATFORM).lower(), "EGL backend not loaded!"

import ssl
from fastapi import Request
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceServer, MediaStreamTrack, RTCConfiguration, sdp

import trimesh
from PIL import Image
import numpy as np
import pickle
from scipy.spatial.transform import Rotation  # For quaternion to rotation matrix
from io import BytesIO
from dotenv import load_dotenv

load_dotenv()


class PyrenderVideoTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, renderer, scene, camera):
        super().__init__()  # don't forget
        self.renderer = renderer
        self.scene = scene
        self.camera_node = camera
        self.frame_counter = 0

    async def recv(self):
        # Render frame
        try:
            rgba, _ = self.renderer.render(
                self.scene,
                flags=pyrender.RenderFlags.RGBA | pyrender.RenderFlags.OFFSCREEN,
            )
            frame = cv2.cvtColor(rgba, cv2.COLOR_RGBA2RGB)
            video_frame = VideoFrame.from_ndarray(frame, format="rgb24")
            video_frame.pts = self.frame_counter
            video_frame.time_base = Fraction(1,30)
            self.frame_counter += 1
            return video_frame
        except Exception as e:
            print(e)


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_headers=["*"],
)
pcs = set()  # track active peer connections

def create_pc():
    pc = RTCPeerConnection(
        RTCConfiguration([
            RTCIceServer(urls="stun:stun.l.google.com:19302"),
        ])
    )

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        print("PC state:", pc.connectionState)
        if pc.connectionState in ["failed", "closed", "disconnected"]:
            pcs.discard(pc)

    @pc.on("datachannel")
    def on_datachannel(channel):
        if channel.label == "camera":
            @channel.on("message")
            def on_message(message):
                if isinstance(message, bytes):
                    message = message.decode("utf-8")
                try:
                    data = json.loads(message)
                    pose = convert_camera_coors(data["position"], data["quaternion"])
                    scene.set_pose(camera_node, pose)
                except Exception as e:
                    print("Failed to update camera:", e, "message was:", message)

    pcs.add(pc)
    return pc




# Path to the GLB file
filename = "static/BSP_TORRENS.glb"
serialized_mesh_file = "serialized_mesh.pkl"


# Ensure the GLB file exists
if not os.path.exists(filename):
    raise FileNotFoundError(f"GLB file not found at {filename}")

if os.path.exists(serialized_mesh_file):
    with open(serialized_mesh_file, "rb") as f:
        mesh = pickle.load(f)
else:
    mesh = trimesh.load_mesh(filename)

with open(serialized_mesh_file, "wb") as f:
    pickle.dump(mesh, f)

SCREEN_WIDTH = int(os.getenv("SCREEN_WIDTH"))
SCREEN_HEIGHT = int(os.getenv("SCREEN_HEIGHT"))
scene = pyrender.Scene()
mesh = pyrender.Mesh.from_trimesh(mesh)

# Sets the position of the object
mesh_initial_position = np.eye(4)
mesh_initial_position[2, 3] = 3.0
mesh_initial_position[0, 3] = 0


mesh_node = pyrender.Node(mesh=mesh, matrix=mesh_initial_position)


@app.post("/candidate")
async def candidate(request: Request):
    data = await request.json()
    if pcs:
        pc = list(pcs)[-1]  # naive: last created pc
        if data.get("candidate"):
            candidate = sdp.candidate_from_sdp(data["candidate"])
            candidate.sdpMid = data.get("sdpMid")
            candidate.sdpMLineIndex = data.get("sdpMLineIndex")
            await pc.addIceCandidate(candidate)
    return {"ok": True}


camera = pyrender.PerspectiveCamera(
    yfov=np.deg2rad(110), aspectRatio=SCREEN_WIDTH / SCREEN_HEIGHT
)
camera_node = pyrender.Node(camera=camera)
light = pyrender.PointLight(intensity=2.0)
light_node = pyrender.Node(light=light, matrix=np.eye(4))
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




@app.post("/offer")
async def offer(request: Request):
    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = create_pc()  # NEW connection per offer

    await pc.setRemoteDescription(offer)

    video_track = PyrenderVideoTrack(r, scene, camera_node)
    sender = pc.addTrack(video_track)

    codecs = sender.getCapabilities("video").codecs
    preferred = [c for c in codecs if c.mimeType == "video/H264"]
    pc.getTransceivers()[-1].setCodecPreferences(preferred)

    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}

# Serve the main HTML page
@app.get("/")
def index():
    return FileResponse("templates/gltf_viewer.html")


def convert_camera_coors(position, quaternion):
    position = np.array([position["x"], position["y"], -position["z"]])
    quaternion = np.array(
        [quaternion["w"], quaternion["z"], quaternion["y"], quaternion["x"]]
    )  # X and Z axes get swapped from ThreeJS to OpenGL
    pose = np.eye(4)
    pose[:3, 3] = position
    rotation = Rotation.from_quat(quaternion).as_matrix()
    pose[:3, :3] = rotation
    return pose


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        ssl_certfile="cert.pem",
        ssl_keyfile="key.pem",
        workers=1,  # force single process
        reload=False,  # disable auto-reload in prod
    )
