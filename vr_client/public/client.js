import * as THREE from "three";
import { VRButton} from './jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from './jsm/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from './jsm/webxr/OculusHandPointerModel.js';









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
document.body.appendChild(VRButton.createButton(renderer, {optionalFeatures: ["hand-tracking", "layers"]} ));
renderer.xr.enabled = true;
camera.layers.enable(1); // Left eye sees layer 1
camera.layers.enable(2); // Right eye sees layer 2

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



function isPinching(hand) {
    const indexTip = hand.joints["index-finger-tip"];
    const thumbTip = hand.joints["thumb-tip"];
    if (!indexTip || !thumbTip) return false;

    const d = indexTip.position.distanceTo(thumbTip.position);
    return d < 0.025;  // 2.5 cm threshold
}


const leftPos = new THREE.Vector3();
const rightPos = new THREE.Vector3();

let prevLeftGrab = new THREE.Vector3();
let prevRightGrab = new THREE.Vector3();
let leftGrabbing = false;
let rightGrabbing = false;
let prevMid = new THREE.Vector3();
let prevDist = 0;
let prevDir = new THREE.Vector3();
let wasTwoHandPinching = false;

function sendTwoHandTransform(leftPos, rightPos) {
  const mid = leftPos.clone().add(rightPos).multiplyScalar(0.5);
  const dist = leftPos.distanceTo(rightPos);
  const dir = rightPos.clone().sub(leftPos).normalize();

  if (prevDist !== 0) {
    ws.send(JSON.stringify({
      type: "transform",
      translate: {
        x: mid.x - prevMid.x,
        y: mid.y - prevMid.y,
        z: mid.z - prevMid.z
      },
      scale: dist / prevDist,
      rotation: {
        from: { x: prevDir.x, y: prevDir.y, z: prevDir.z },
        to:   { x: dir.x,     y: dir.y,     z: dir.z }
      }
    }));
  }

  prevMid.copy(mid);
  prevDist = dist;
  prevDir.copy(dir);
}


function sendOneHandGrab(hand, side) {
  const tip = hand.joints["index-finger-tip"];
  if (!tip) return;

  const curr = new THREE.Vector3();
  tip.getWorldPosition(curr);

  if (side === "left") {
    if (!leftGrabbing) {
      prevLeftGrab.copy(curr);
      leftGrabbing = true;
      return;
    }

    const delta = curr.clone().sub(prevLeftGrab);
    prevLeftGrab.copy(curr);

    ws.send(JSON.stringify({
      type: "onehand",
      hand: "left",
      delta: { x: delta.x, y: delta.y, z: delta.z }
    }));
  }

  if (side === "right") {
    if (!rightGrabbing) {
      prevRightGrab.copy(curr);
      rightGrabbing = true;
      return;
    }

    const delta = curr.clone().sub(prevRightGrab);
    prevRightGrab.copy(curr);

    ws.send(JSON.stringify({
      type: "onehand",
      hand: "right",
      delta: { x: delta.x, y: delta.y, z: delta.z }
    }));
  }
}






const videoLeft = document.createElement("video");
const videoRight = document.createElement("video");

// Create a texture from your 2D canvas
const videoTextureLeft = new THREE.VideoTexture(videoLeft);
videoTextureLeft.minFilter = THREE.LinearFilter;
videoTextureLeft.magFilter = THREE.LinearFilter;
videoTextureLeft.generateMipmaps = false;
videoTextureLeft.colorSpace = THREE.SRGBColorSpace; // if your pipeline uses sRGB

const videoTextureRight = new THREE.VideoTexture(videoRight);
videoTextureRight.minFilter = THREE.LinearFilter;
videoTextureRight.magFilter = THREE.LinearFilter;
videoTextureRight.generateMipmaps = false;
videoTextureRight.colorSpace = THREE.SRGBColorSpace; // if your pipeline uses sRGB


const videoMaterialLeft = new THREE.MeshBasicMaterial({ map: videoTextureLeft, toneMapped: false });
const videoMaterialRight = new THREE.MeshBasicMaterial({ map: videoTextureRight, toneMapped: false});


// Create a sphere that surrounds the user
const radius = 10.0; // Adjust for comfort (1.5–3.0)
const sphereGeometry = new THREE.SphereGeometry(radius, 60, 40);
// Invert the faces to render inside
sphereGeometry.scale(-1, 1, 1); // Critical: flip normals inward


const videoSphereLeft = new THREE.Mesh(sphereGeometry, videoMaterialLeft);
const videoSphereRight = new THREE.Mesh(sphereGeometry, videoMaterialRight);



videoLeft.autoplay = true;
videoLeft.playsInline = true;
videoLeft.muted = true;  // WebRTC requires muted autoplay sometimes
videoRight.autoplay = true;
videoRight.playsInline = true;
videoRight.muted = true;  // WebRTC requires muted autoplay sometimes

let pos = new THREE.Vector3();
let quat = new THREE.Quaternion();
const xrCamera = renderer.xr.getCamera(camera);
player.add(videoSphereLeft);
player.add(videoSphereRight);
videoSphereLeft.layers.set(1);
videoSphereRight.layers.set(2);


const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, {
    urls: "turn:your-turn-server.com:3478",
    username: "user",
    credential: "pass"
  }]
    });

const ws = new WebSocket("wss://10.24.46.139:3001"); // connect to streamer server

ws.onopen = () => {
  console.log("Connected to signaling server (headset)");
  ws.send(JSON.stringify({ role: "headset" })); // register as headset
};

renderer.setAnimationLoop(() => {



  const leftPinch = isPinching(hand1);
  const rightPinch = isPinching(hand2);

  if (leftPinch) {
    hand1.joints["index-finger-tip"].getWorldPosition(leftPos);
  }

  if (rightPinch) {
    hand2.joints["index-finger-tip"].getWorldPosition(rightPos);
  }


  // TWO-HAND TRANSFORM
  if (leftPinch && rightPinch) {
    sendTwoHandTransform(leftPos, rightPos);
    wasTwoHandPinching = true;
    leftGrabbing = false;
    rightGrabbing = false;
  }
  
  else {
  if (leftPinch) {
    sendOneHandGrab(hand1, "left");
  } else {
    leftGrabbing = false;
  }

  if (rightPinch) {
    sendOneHandGrab(hand2, "right");
  } else {
    rightGrabbing = false;
  }

  wasTwoHandPinching = false;
  prevDist = 0;
  
  }
    

  handleControllerMovement();
  xrCamera.getWorldPosition(pos);
  xrCamera.getWorldQuaternion(quat);
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({type:"pose",position: { x: pos.x, y: pos.y, z: pos.z },
    quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w }}));    
    }
  // Render scene into headset
  renderer.render(scene, camera);
  
});


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

let res = [];
pc.ontrack = (event) => {
    console.log("ontrack fired:", event.track, "streams:", event.streams);
    res.push(event.streams[0]);
    console.log(res);
    if (res.length == 2) {
      videoLeft.srcObject = res[0];
      videoRight.srcObject = res[1];
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
