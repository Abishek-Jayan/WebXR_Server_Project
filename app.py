
import time
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import eventlet
import eventlet.wsgi
import os,json
os.environ["PYOPENGL_PLATFORM"] = "egl"
os.environ["EGL_PLATFORM"]="surfaceless"
import pyrender

import trimesh
import numpy as np
import pickle
from scipy.spatial.transform import Rotation  # For quaternion to rotation matrix
from io import BytesIO
from dotenv import load_dotenv
load_dotenv()  

app = Flask(__name__)
# Path to the GLB file
filename = "static/Duck.glb"
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

SCREEN_WIDTH = int(os.getenv("SCREEN_WIDTH", 1920))
SCREEN_HEIGHT = int(os.getenv("SCREEN_HEIGHT", 1080))
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
pyrenderer = pyrender.OffscreenRenderer(SCREEN_WIDTH, SCREEN_HEIGHT)
buffered = BytesIO()



def render_scene(pose, eye_offset = 0.0):
    start_time = time.time() #Tracking time taken for function to run
    adjusted_pose = pose.copy()
    adjusted_pose[0,3] += eye_offset # Displacing the image a little bit to make it parallel to the corresponding eye
    scene.set_pose(camera_node, adjusted_pose)
    color_image, depth_image = pyrenderer.render(scene, flags = pyrender.RenderFlags.RGBA)
    end_time = time.time()
    print(f"render_scene time (eye_offset={eye_offset}): {(end_time - start_time)*1000:.2f} ms")
    return color_image.tobytes(), depth_image.astype(np.float32).tobytes()



# Serve the main HTML page
@app.route("/")
def index():
    return render_template('gltf_viewer.html',SCREEN_WIDTH=SCREEN_WIDTH,
        SCREEN_HEIGHT=SCREEN_HEIGHT)

@socketio.on('connect')
def handle_connect():
    print("Client connected:")

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected:")


@socketio.on('camera_data')
def update_camera(camera):
    print("Recieved new camera data")
    current_time = time.time()

    camera = json.loads(camera)
    print("Camera pos before conversion: "+str(camera.get("position")) + "\n Camera quaternion: "+ str(camera.get("quaternion")))
    
    # Extract position and quaternion
    position = camera.get("position")
    quaternion = camera.get("quaternion")
    start_time = time.time()
    pose = convert_camera_coords(position,quaternion)
    print("Camera after conversion: "+ str(pose))


    left_img_color, left_depth = eventlet.spawn(render_scene,pose,-0.03).wait()
    right_img_color, right_depth =  eventlet.spawn(render_scene,pose,0.03).wait()
    socketio.emit('image_update', {'left_image': left_img_color, 'left_depth': left_depth, 'right_image': right_img_color, 'right_depth': right_depth})
    end_time = time.time()
    print(f"Total time taken: {(end_time - start_time)*1000:.2f} ms")
    print("Finished rendering the new scenes")


@socketio.on('camera_params')
def update_camera_params(params):
    global camera, camera_node
    fov = params.get('fov', 110)  # Default to 110 if not provided
    aspect = params.get('aspect', SCREEN_WIDTH / SCREEN_HEIGHT)
    print(f"Updating camera with FOV: {fov}, Aspect: {aspect}")
    scene.remove_node(camera_node)
    camera = pyrender.PerspectiveCamera(yfov=np.deg2rad(fov), aspectRatio=aspect)
    camera_node = pyrender.Node(camera=camera)
    scene.add_node(camera_node)

def convert_camera_coords(position,quaternion):
    position = np.array([position['x'], position['y'], -position['z']])
    quaternion = np.array([quaternion['w'], quaternion['z'], quaternion['y'], quaternion['x']]) #X and Z axes get swapped from ThreeJS to OpenGL
    pose = np.eye(4)
    pose[:3, 3] = position
    rotation = Rotation.from_quat(quaternion).as_matrix()  
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