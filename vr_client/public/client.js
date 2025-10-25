import * as THREE from "three";
import { VRButton} from './jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from './jsm/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from './jsm/webxr/OculusHandPointerModel.js';


const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext("2d");

let hand1, hand2;
let controller1, controller2;
let controllerGrip1, controllerGrip2;


// Create Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
scene.add(ambientLight);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));
renderer.xr.enabled = true;


renderer.xr.addEventListener("sessionstart", ()=> {
  console.log("VR Session Started");
    ws.send(JSON.stringify({ xr: true }));

});


const player = new THREE.Group();
player.add(camera);
scene.add(player);




controller1 = renderer.xr.getController( 0 );
player.add( controller1 );

controller2 = renderer.xr.getController( 1 );

player.add( controller2 );

const controllerModelFactory = new XRControllerModelFactory();

// Controller 1
controller1 = renderer.xr.getController(0);
player.add(controller1);

controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
player.add(controllerGrip1);

// Controller 2
controller2 = renderer.xr.getController(1);
player.add(controller2);

controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
player.add(controllerGrip2);

// Hand 1
hand1 = renderer.xr.getHand( 0 );
hand1.add( new OculusHandModel( hand1 ) );
const handPointer1 = new OculusHandPointerModel( hand1, controller1 );
hand1.add( handPointer1 );
player.add( hand1 );

// Hand 2
hand2 = renderer.xr.getHand( 1 );
hand2.add( new OculusHandModel( hand2 ) );
const handPointer2 = new OculusHandPointerModel( hand2, controller2 );
hand2.add( handPointer2 );
player.add( hand2 );

const geom = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

const line = new THREE.Line( geom );
line.name = 'line';
line.scale.z = 5;

controller1.add( line.clone() );
controller2.add( line.clone() );

function handleControllerMovement() {
  const session = renderer.xr.getSession();
  if (!session) return;

  for (const source of session.inputSources) {
    if (!source.gamepad) continue; // skip if no gamepad

    const axes = source.gamepad.axes; // [xAxis, yAxis, ...]\ 
    // Apply deadzone (avoid drift)
    if (source.handedness === "left") {
      // Left controller → XY walking
      const lx = axes[2] || axes[0]; // left/right stick (varies by headset)
      const ly = axes[3] || axes[1]; // forward/back stick
      ws.send(JSON.stringify({type:"left",lx:lx,ly:ly}));
    }

      if (source.handedness === "right") {
      // Right controller → vertical
      const ry = axes[3] || axes[1] || 0;
      ws.send(JSON.stringify({type:"right",ry:ry}));

    }
    
  }
}

// Create a texture from your 2D canvas
const videoTextureLeft = new THREE.CanvasTexture(canvas);
videoTextureLeft.minFilter = THREE.LinearFilter;
videoTextureLeft.magFilter = THREE.LinearFilter;
const videoTextureRight = new THREE.CanvasTexture(canvas);
videoTextureRight.minFilter = THREE.LinearFilter;
videoTextureRight.magFilter = THREE.LinearFilter;

const videoMaterialLeft = new THREE.MeshBasicMaterial({ map: videoTextureLeft, side: THREE.DoubleSide });
const videoMaterialRight = new THREE.MeshBasicMaterial({ map: videoTextureRight, side: THREE.DoubleSide });

const videoPlaneLeft = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), videoMaterialLeft);
const videoPlaneRight = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), videoMaterialRight);

const videoLeft = document.createElement("video");
const videoRight = document.createElement("video");

videoLeft.autoplay = true;
videoLeft.playsInline = true;
videoLeft.muted = true;  // WebRTC requires muted autoplay sometimes
videoRight.autoplay = true;
videoRight.playsInline = true;
videoRight.muted = true;  // WebRTC requires muted autoplay sometimes

let pos = new THREE.Vector3();
let quat = new THREE.Quaternion();
const xrCamera = renderer.xr.getCamera(camera);
videoPlaneLeft.position.set(0, 0, -0.5);
videoPlaneRight.position.set(0, 0, -0.5);
camera.add(videoPlaneLeft);
camera.add(videoPlaneRight);
videoPlaneLeft.layers.set(1);
videoPlaneRight.layers.set(2);

renderer.setAnimationLoop(() => {
  handleControllerMovement();
  xrCamera.getWorldPosition(pos);
  xrCamera.getWorldQuaternion(quat);
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type:"pose",position: { x: pos.x, y: pos.y, z: pos.z },
    quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }}));
    }

    if (videoLeft.readyState >= videoLeft.HAVE_CURRENT_DATA) {
      ctx.drawImage(videoLeft, 0, 0, canvas.width, canvas.height);
      videoTextureLeft.needsUpdate = true;
    }
    if (videoRight.readyState >= videoRight.HAVE_CURRENT_DATA) {
      ctx.drawImage(videoRight, 0, 0, canvas.width, canvas.height);
      videoTextureRight.needsUpdate = true;
    }
  // Render scene into headset
  renderer.render(scene, camera);
  
});
function drawVideo() {
    xrCamera.getWorldPosition(pos);
    xrCamera.getWorldQuaternion(quat);
    if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type:"pose",position: { x: pos.x, y: pos.y, z: pos.z },
    quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }}));
    }
    if (videoLeft.readyState >= videoLeft.HAVE_CURRENT_DATA) {
        ctx.drawImage(videoLeft, 0, 0, canvas.width, canvas.height);
        videoTextureLeft.needsUpdate = true;
    }
    requestAnimationFrame(drawVideo);
}

// videoLeft.addEventListener("playing", () => {
//     drawVideo();
// });
const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

const ws = new WebSocket("wss://10.24.46.139:3001"); // connect to streamer server

ws.onopen = () => {
  console.log("Connected to signaling server (headset)");
  ws.send(JSON.stringify({ role: "headset" })); // register as headset
};

document.addEventListener('keydown',(event) => {
  if(event.key === "w" || event.key === "W")
    ws.send(JSON.stringify({ move: "forward" }));
  if(event.key === "s" || event.key === "S")
    ws.send(JSON.stringify({ move: "backward" }));
  if(event.key === "d" || event.key === "D")
    ws.send(JSON.stringify({ move: "left" }));
  if(event.key === "a" || event.key === "A")
    ws.send(JSON.stringify({ move: "right" }));
  });
  
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "offer") {
    console.log("Received offer from streamer");
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    ws.send(
      JSON.stringify({
        role: "headset",
        type: "answer",
        answer: pc.localDescription,
      })
    );
    console.log("Sending answer to server");
  }

  if (data.type === "candidate") {
    console.log("Received ICE candidate from streamer");
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("Error adding candidate:", err);
    }
  }
};

let count = 0;
pc.ontrack = (event) => {
    console.log("ontrack fired:", event.track, "streams:", event.streams);
    if (count == 0) {
      videoLeft.srcObject = event.streams[0];
      count++;
    }
    else if (count == 1) {
      videoRight.srcObject = event.streams[0];
      videoLeft.play();
      videoRight.play();
    }


};

// Send ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    ws.send(
      JSON.stringify({
        role: "headset",
        type: "candidate",
        candidate: event.candidate,
      })
    );
  }
};
