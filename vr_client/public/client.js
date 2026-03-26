import * as THREE from "three";
import { VRButton} from './jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from './jsm/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from './jsm/webxr/OculusHandPointerModel.js';
import Stats from './jsm/libs/stats.module.js';
import { HOSTNAME } from "../../image_server/public/env.js";
import { print_network_log, print_video_fps, start_receiver_stats } from "../../logging/network_logging.js";
import { log, setSender } from "../../logging/logger.js";

let hand1, hand2;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

const stats = new Stats();
document.body.appendChild(stats.dom);
// Create Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
scene.background = new THREE.Color(0x658CBB); // Set background to red
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
scene.add(ambientLight);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, {optionalFeatures: ["hand-tracking", "layers"]} ));
renderer.xr.enabled = true;
    camera.layers.enable(1);
    camera.layers.enable(2);
renderer.xr.addEventListener("sessionstart", async () => {
  console.log("VR Session Started");

  const session = renderer.xr.getSession();
  const hasLayers = typeof XRMediaBinding !== 'undefined';

  if (hasLayers) {
    try {
      const refSpace = await session.requestReferenceSpace("local");
      const mediaBinding = new XRMediaBinding(session);
      const equirectLayer = mediaBinding.createEquirectangularLayer(video, {
        space: refSpace,
        layout: "stereo-top-bottom",
        centralHorizontalAngle: 2 * Math.PI,
        upperVerticalAngle: Math.PI / 2,
        lowerVerticalAngle: Math.PI / 2,
      });
      session.updateRenderState({ layers: [equirectLayer] });
      console.log("XRMediaBinding equirect layer set up successfully");
    } catch (e) {
      console.error("XRMediaBinding failed, falling back to video spheres:", e);
      player.add(videoSphereLeft);
      player.add(videoSphereRight);
      videoSphereLeft.layers.set(1);
      videoSphereRight.layers.set(2);
    }
  } else {
    console.log("XRMediaBinding not available, using video spheres");
    player.add(videoSphereLeft);
    player.add(videoSphereRight);
    videoSphereLeft.layers.set(1);
    videoSphereRight.layers.set(2);
  }
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
      ws.send(JSON.stringify({type:"left",lx:lx,ly:ly,_t:Date.now()}));
    }

      if (source.handedness === "right") {
      // Right controller → vertical
      const ry = axes[3] || axes[1] || 0;
      ws.send(JSON.stringify({type:"right",ry:ry,_t:Date.now()}));

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

const video = document.createElement("video");
video.autoplay = true;
video.playsInline = true;
video.muted = true;

// Left eye samples top half of the combined stereo video
const texLeft = new THREE.VideoTexture(video);
texLeft.minFilter = THREE.LinearFilter;
texLeft.magFilter = THREE.LinearFilter;
texLeft.generateMipmaps = false;
texLeft.colorSpace = THREE.SRGBColorSpace;
texLeft.repeat.set(1, 0.5);
texLeft.offset.set(0, 0.5);

// Right eye samples bottom half of the combined stereo video
const texRight = new THREE.VideoTexture(video);
texRight.minFilter = THREE.LinearFilter;
texRight.magFilter = THREE.LinearFilter;
texRight.generateMipmaps = false;
texRight.colorSpace = THREE.SRGBColorSpace;
texRight.repeat.set(1, 0.5);
texRight.offset.set(0, 0);

const videoMaterialLeft  = new THREE.MeshBasicMaterial({ map: texLeft,  toneMapped: false, side: THREE.BackSide });
const videoMaterialRight = new THREE.MeshBasicMaterial({ map: texRight, toneMapped: false, side: THREE.BackSide });

const sphereGeometry = new THREE.SphereGeometry(10.0, 60, 40);
const videoSphereLeft  = new THREE.Mesh(sphereGeometry, videoMaterialLeft);
const videoSphereRight = new THREE.Mesh(sphereGeometry, videoMaterialRight);
// spheres are added to scene in sessionstart (fallback path only)

let pos = new THREE.Vector3();
let quat = new THREE.Quaternion();
const xrCamera = renderer.xr.getCamera(camera);



const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
const _receiverStats = start_receiver_stats(pc);

const ws = new WebSocket(`wss://${HOSTNAME}:3001`); // connect to streamer server
setSender((line) => {
  if (ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: "log", msg: line }));
});

ws.onopen = () => {
  console.log("Connected to signaling server (headset)");
  ws.send(JSON.stringify({ role: "headset" })); // register as headset
};

renderer.setAnimationLoop(() => {
  stats.begin();


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
  stats.end();
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
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("Error adding candidate:", err);
    }
  }

  if (data.type === "render_ack") {
    const _ackTs = data.t;
    const _ackData = data;
    video.requestVideoFrameCallback((_now, metadata) => {
      const presentMs = metadata.presentationTime != null
        ? metadata.presentationTime + performance.timeOrigin
        : Date.now();
      const totalMs = Math.round(presentMs - _ackTs);
      const rttHalf = _receiverStats.getNetworkMs();
      const inputTransitMs = rttHalf.toFixed(1);
      const videoTransitMs = rttHalf.toFixed(1);
      const frameWaitMs = (_ackData.frameWaitMs ?? 0).toFixed(1);
      const jitterBufferMs = _receiverStats.getJitterBufferMs().toFixed(1);
      const decodeMs = _receiverStats.getDecodeMs().toFixed(1);
      const displayMs = (metadata.expectedDisplayTime && metadata.presentationTime)
        ? (metadata.expectedDisplayTime - metadata.presentationTime).toFixed(1)
        : 'N/A';
      const captureNote = (metadata.captureTime && metadata.receiveTime)
        ? ` [RTP encode+net=${(metadata.receiveTime - metadata.captureTime).toFixed(1)}ms]`
        : '';
      log(
        `[LATENCY BREAKDOWN]\n` +
        `  input → server     : ${inputTransitMs} ms (≈RTT/2)\n` +
        `  frame sched. wait  : ${frameWaitMs} ms\n` +
        `  raymarch rendering : ${_ackData.raymarchMs?.toFixed(1) ?? 'N/A'} ms\n` +
        `  cubemap → ERP      : ${_ackData.erpMs?.toFixed(1) ?? 'N/A'} ms\n` +
        `  WebRTC encode      : ${_ackData.encodeMs?.toFixed(1) ?? 'N/A'} ms${captureNote}\n` +
        `  video → headset    : ${videoTransitMs} ms (≈RTT/2)\n` +
        `  jitter buffer      : ${jitterBufferMs} ms\n` +
        `  decode on headset  : ${decodeMs} ms\n` +
        `  display vsync      : ${displayMs} ms\n` +
        `  ─────────────────────────\n` +
        `  input → photon     : ${totalMs} ms`
      );
    });
  }
};

pc.ontrack = (event) => {
  console.log("ontrack fired:", event.track, "streams:", event.streams);
  video.srcObject = event.streams[0];
  video.play();
  print_video_fps(video);
};

// Send ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    ws.send(JSON.stringify({
      type: "candidate",
      candidate: event.candidate,
    }));
  }
};
print_network_log(pc);
