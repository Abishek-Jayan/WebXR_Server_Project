import * as THREE from "three";
import { OrbitControls } from "./jsm/controls/OrbitControls.js";
import { VRButton} from './jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { CubemapToEquirectangular } from './CubeMaptoEquirect.js';
import { NRRDLoader } from './jsm/loaders/NRRDLoader.js';
import rayMarchMaterial from "./raymarch.js";
import Stats from './jsm/libs/stats.module.js';
import HOSTNAME from "./env.js";


const renderWidth = 1920; // desired output width
const renderHeight = 1080; // desired output height


const scene = new THREE.Scene();
const stats = new Stats();
document.body.appendChild(stats.dom);
const nrrd = await new NRRDLoader().loadAsync("./mesh_voxelized(0.05).nrrd");
console.log(nrrd);
// Build 3D texture
const texture3D = new THREE.Data3DTexture(
  nrrd.data,
  nrrd.xLength,
  nrrd.yLength,
  nrrd.zLength
);

const headsetForward = new THREE.Vector3(0, 0, -1); // default forward

function threeTypeForTypedArray(arr) {
  if (arr instanceof Uint8Array) return THREE.UnsignedByteType;
  if (arr instanceof Int8Array) return THREE.ByteType;
  if (arr instanceof Uint16Array) return THREE.UnsignedShortType;
  if (arr instanceof Int16Array) return THREE.ShortType;
  if (arr instanceof Uint32Array) return THREE.UnsignedIntType;
  if (arr instanceof Int32Array) return THREE.IntType;
  if (arr instanceof Float32Array) return THREE.FloatType;
  throw new Error("Unsupported NRRD data array type: " + arr.constructor.name);
}

texture3D.format = THREE.RedFormat;
texture3D.type = threeTypeForTypedArray(nrrd.data);   // For 8-bit NRRD
texture3D.minFilter = THREE.LinearFilter;
texture3D.magFilter = THREE.LinearFilter;
texture3D.unpackAlignment = 1;
texture3D.needsUpdate = true;

rayMarchMaterial.uniforms.volumeTex.value = texture3D;
rayMarchMaterial.uniforms.dims.value.set(nrrd.xLength, nrrd.yLength, nrrd.zLength);

const geometry = new THREE.BoxGeometry(1, 1, 1);  // size in world units
const material = new THREE.ShaderMaterial({
    uniforms: rayMarchMaterial.uniforms,
    vertexShader: rayMarchMaterial.vertexShader,
    fragmentShader: rayMarchMaterial.fragmentShader,
    side: THREE.BackSide,
    transparent: true,
});

// Volume mesh (the box the shader raymarches inside)
const mesh = new THREE.Mesh(geometry, material);

const sx = nrrd.xLength, sy = nrrd.yLength, sz = nrrd.zLength;
const maxDim = Math.max(sx, sy, sz);
const worldMax = 20; // choose how big the volume should be in world units

mesh.scale.set(
  (sx / maxDim) * worldMax,
  (sy / maxDim) * worldMax,
  (sz / maxDim) * worldMax
);

let controller1, controller2;
let controllerGrip1, controllerGrip2;
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(30, 30, 100);

const ambientLight = new THREE.AmbientLight(0x404040, 10); // soft white
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 10);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight);

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:"high-performance", preserveDrawingBuffer: true, alpha: false});
renderer.xr.enabled = true;
renderer.xr.addEventListener("sessionstart", ()=> {
  console.log("VR Session Started");
});



renderer.setSize(renderWidth, renderHeight, false); // 'false' preserves canvas CSS size


renderer.domElement.style.width = window.innerWidth + "px";
renderer.domElement.style.height = window.innerHeight + "px";


document.body.appendChild(renderer.domElement);

const player = new THREE.Group();
player.add(mesh);
mesh.position.set(0, 0, -10);
player.add(camera);
scene.add(player);
const vrButton =  VRButton.createButton( renderer, {optionalFeatures: ["hand-tracking", "layers"]} );
document.body.appendChild(vrButton);


const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 10, 0);
controls.minDistance = 40.0;
controls.maxDistance = 200.0;

// controllers

controller1 = renderer.xr.getController( 0 );
player.add( controller1 );


const controllerModelFactory = new XRControllerModelFactory();


controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
player.add(controllerGrip1);

// Controller 2
controller2 = renderer.xr.getController(1);
player.add(controller2);

controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
player.add(controllerGrip2);



const geom = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

const line = new THREE.Line( geom );
line.name = 'line';
line.scale.z = 5;

controller1.add( line.clone() );
controller2.add( line.clone() );

function handleControllerMovement(handedness,leftx=0,lefty=0,righty=0) {
  
  

    const deadzone = 0.15;
    if (handedness === "left") {
      // Left controller → XY walking
      const lx = leftx;
      const ly = lefty;
      const moveX = Math.abs(lx) > deadzone ? lx : 0;
      const moveY = Math.abs(ly) > deadzone ? ly : 0;

      if (moveX !== 0 || moveY !== 0) {
        movePlayerHorizontal(moveX, moveY);
      }
    }

      if (handedness === "right") {

      // Right controller → vertical
      const ry = righty;
      const vertical = Math.abs(ry) > deadzone ? ry : 0;

      if (vertical !== 0) {
        movePlayerVertical(vertical);
      }
    }
    
  
}



function movePlayerHorizontal(x, y) {
  const speed = 0.05;

  // Get the headset forward direction
  const dir = new THREE.Vector3().copy(headsetForward);

  // Strafe direction (right vector)
  const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  // Move player rig
  newplayer.position.addScaledVector(dir, -y * speed);     // forward/back 
  newplayer.position.addScaledVector(strafe, x * speed);   // left/right
}


function movePlayerVertical(y) {
  const speed = 0.05;
  newplayer.position.y += y * speed; 
  // negative because stick up is usually negative
}


window.addEventListener(
  "resize",
  function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  },
  false
);



			


const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});


const ws = new WebSocket(`wss://${HOSTNAME}:3001`); // connect to server.js

ws.onopen = async () => {
  console.log("Connected to signaling server (streamer)");
  ws.send(JSON.stringify({ role: "streamer" }));


  function preferH264(sdp) {
    const lines = sdp.split("\r\n");
    const mLineIndex = lines.findIndex(l => l.startsWith("m=video"));
    if (mLineIndex < 0) return sdp;
    
    const h264Payload = lines
        .filter(l => l.includes("H264/90000"))
        .map(l => l.match(/:(\d+) H264\/90000/)[1])[0];

    if (!h264Payload) return sdp;

    const parts = lines[mLineIndex].split(" ");
    lines[mLineIndex] = [...parts.slice(0, 3), h264Payload, ...parts.slice(3).filter(p => p !== h264Payload)].join(" ");
    return lines.join("\r\n");
  }
  
  // Create offer to headset
  const offer = await pc.createOffer();
  offer.sdp = preferH264(offer.sdp);
  await pc.setLocalDescription(offer);
  pc.getSenders().forEach(sender => {
    if (!sender.track || sender.track.kind !== 'video') return;
    const p = sender.getParameters();
    if (!p.encodings) p.encodings = [{}];
    Object.assign(p.encodings[0], {
    maxBitrate: 25_000_000,     // start ~10 Mbps per stream; tune up/down
    maxFramerate: 90,           // match capture target
    priority: "high",
    networkPriority: "high",
    scaleResolutionDownBy: 1.0  // raise (e.g., 1.25–2) if encoder is the bottleneck

    });
    p.degradationPreference = 'maintain-resolution';
    sender.setParameters(p).catch(()=>{});
    const effective = sender.getParameters();
    console.log('encodings after setParameters', effective.encodings);
    // Content hint on the track itself:
    try { sender.track.contentHint = 'motion'; } catch {}
  });
  ws.send(
    JSON.stringify({
      role: "streamer",
      type: "offer",
      offer: pc.localDescription,
    })
  );
  console.log("Sent offer to server");

};


let newcamLeft = new THREE.PerspectiveCamera(75, renderWidth / renderHeight, 0.1, 1000);
let newcamRight = new THREE.PerspectiveCamera(75, renderWidth / renderHeight, 0.1, 1000);





let ipd = 0.064;
newcamLeft.position.set(-ipd / 2, 0, 0);
newcamRight.position.set(ipd / 2, 0, 0);
const newplayer = new THREE.Group();
newplayer.add(newcamLeft);
newplayer.add(newcamRight);
scene.add(newplayer);


ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
    if (data.xr === true) {
  if (vrButton) {
    console.log("📢 Triggering VRButton click from WS event");
    vrButton.click();
    
  } else {
    console.warn("⚠️ VRButton not found in DOM");
  }
  }
  
  if (data.type === "onehand") {
  mesh.position.add(new THREE.Vector3(
    data.delta.x,
    -data.delta.y,
    data.delta.z
  ).multiplyScalar(20.0));
  }
  if (data.type === "transform") {

    // TRANSLATION
    mesh.position.add(new THREE.Vector3(
      data.translate.x,
      data.translate.y,
      data.translate.z
    ));

    // SCALE
    mesh.scale.multiplyScalar(data.scale);

    // ROTATION
    const from = new THREE.Vector3(
      data.rotation.from.x,
      data.rotation.from.y,
      data.rotation.from.z
    ).normalize();

    const to = new THREE.Vector3(
      data.rotation.to.x,
      data.rotation.to.y,
      data.rotation.to.z
    ).normalize();

    const q = new THREE.Quaternion().setFromUnitVectors(from, to);
    mesh.quaternion.premultiply(q);
  }


  if (data.type === "left")
  {
    handleControllerMovement("left",data.lx,data.ly,0);
  }
  if(data.type === "right")
  {
    handleControllerMovement("right",0,0,data.ry);
  }
 if(data.type === "pose") {
  const q = data.quaternion;

  const forward = new THREE.Vector3(0, 0, -1); // camera looks down -Z
  forward.applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));

  // Optional: ignore vertical component so movement is on XZ plane
  forward.y = 0;
  forward.normalize();

  headsetForward.copy(forward);
  }

  if (data.type === "answer") {
    console.log("Received answer from headset");
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  
  if (data.type === "candidate") {
      try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  }
};

// Send our ICE candidates back to headset
pc.onicecandidate = (event) => {
  if (event.candidate) {
    ws.send(
      JSON.stringify({
        type: "candidate",
        candidate: event.candidate,
      })
    );
  }
};
const streamRendererLeft = new THREE.WebGLRenderer({  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,

});
const streamRendererRight = new THREE.WebGLRenderer( { alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,

});
streamRendererLeft.setSize(renderWidth,renderHeight);

streamRendererLeft.xr.enabled = true;

streamRendererRight.setSize(renderWidth,renderHeight);


streamRendererRight.xr.enabled = true;

const cubeMapSize = renderWidth;
const options = { format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
const renderTarget = new THREE.WebGLCubeRenderTarget(cubeMapSize, options);
const cubeCamera = new THREE.CubeCamera(0.1, 2000, renderTarget);



const equiLeft = new CubemapToEquirectangular(streamRendererLeft, cubeCamera, renderTarget, renderWidth, renderHeight);
const equiRight = new CubemapToEquirectangular(streamRendererRight, cubeCamera, renderTarget, renderWidth, renderHeight);

// Add stream
const streamLeft = streamRendererLeft.domElement.captureStream();
streamLeft.getTracks().forEach((track) => pc.addTrack(track, streamLeft));
const streamRight = streamRendererRight.domElement.captureStream();
streamRight.getTracks().forEach((track) => pc.addTrack(track, streamRight));









renderer.setAnimationLoop(function () {
  stats.begin();
  const xrCam = renderer.xr.getCamera(camera);
  if (!xrCam.cameras || xrCam.cameras.length < 2) {
      stats.end();
      return;  // ≠ VR mode yet → skip
  }
  const l = xrCam.cameras[0];
  const r = xrCam.cameras[1];
  
  ipd = l.position.distanceTo(r.position);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion);
  newcamLeft.position.copy(newplayer.position).addScaledVector(right, -ipd/2);
  newcamRight.position.copy(newplayer.position).addScaledVector(right, ipd/2);

  newcamLeft.quaternion.copy(newplayer.quaternion);
  newcamRight.quaternion.copy(newplayer.quaternion);

  equiLeft.update(newcamLeft, scene);
  equiRight.update(newcamRight, scene);
  
  
  
  renderer.render(scene,camera);

  stats.end();

  
});

