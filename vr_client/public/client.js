import * as THREE from "three";
import { VRButton} from './jsm/webxr/VRButton.js';

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext("2d");

// Create Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));
renderer.xr.enabled = true;

renderer.xr.addEventListener("sessionstart", ()=> {
  console.log("VR Session Started");
    ws.send(JSON.stringify({ xr: true }));
});


// Create a texture from your 2D canvas
const videoTexture = new THREE.CanvasTexture(canvas);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;


// Plane to show the video
const geometry = new THREE.PlaneGeometry(4, 3); // adjust aspect ratio
const material = new THREE.MeshBasicMaterial({ map: videoTexture });
const screenMesh = new THREE.Mesh(geometry, material);
scene.add(screenMesh);

const video = document.createElement("video");
video.autoplay = true;
video.playsInline = true;
video.muted = true;  // WebRTC requires muted autoplay sometimes
let pos = new THREE.Vector3();
let quat = new THREE.Quaternion();
const xrCamera = renderer.xr.getCamera(camera);
function drawVideo() {
    xrCamera.getWorldPosition(pos);
    xrCamera.getWorldQuaternion(quat);
    if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type:"pose",position: { x: pos.x, y: pos.y, z: pos.z },
    quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }}));
    }
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        videoTexture.needsUpdate = true;
    }
    requestAnimationFrame(drawVideo);
}

video.addEventListener("playing", () => {
    drawVideo();
});
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


pc.ontrack = (event) => {
    console.log("ontrack fired:", event.track, "streams:", event.streams);
    video.srcObject = event.streams[0];
    video.play();
    video.onplaying = () => console.log("Video is playing");
    video.onpause = () => console.log("Video paused");

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
