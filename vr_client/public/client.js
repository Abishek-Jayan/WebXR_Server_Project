/**
 * Work based on the Three JS Ocean examples at
 * https://threejs.org/examples/?q=water#webgl_shaders_ocean
 */
import * as THREE from "three";
import Stats from "./jsm/libs/stats.module.js";
import { GUI } from "./jsm/libs/lil-gui.module.min.js";
import { Water } from "./jsm/objects/Water.js";
import { Sky } from "./jsm/objects/Sky.js";
import { VRButton} from './jsm/webxr/VRButton.js';
import { GLTFLoader } from "./jsm/loaders/GLTFLoader.js";
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from './jsm/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from './jsm/webxr/OculusHandPointerModel.js';
import { PDBLoader } from './jsm/loaders/PDBLoader.js';

const scene = new THREE.Scene();
let hand1, hand2;

let controller1, controller2;
let controllerGrip1, controllerGrip2;
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(30, 30, 100);




const video = document.createElement("video");
video.autoplay = true;
video.playsInline = true;
video.muted = true;  // WebRTC requires muted autoplay sometimes
const videoTexture = new THREE.VideoTexture(video);
const leftMaterial = new THREE.SpriteMaterial({map:videoTexture});
const rightMaterial = new THREE.SpriteMaterial({map:videoTexture});
const leftSprite = new THREE.Sprite(leftMaterial);
const rightSprite = new THREE.Sprite(rightMaterial);

leftSprite.position.set(-0.03, 0, -1); // Closer to camera
leftSprite.scale.set(16, 9, 1);
leftSprite.layers.set(0);
camera.add(leftSprite); // Attach to camera


rightSprite.position.set(0.03, 0, -1); // Closer to camera
rightSprite.scale.set(16, 9, 1);
rightSprite.layers.set(0);
camera.add(rightSprite); // Attach to camera



const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:"high-performance"});
renderer.xr.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const sessionInit = {
					optionalFeatures: [ 'hand-tracking' ]
				};
renderer.xr.enabled = true;
renderer.autoClear = true; // Changed back to true to ensure proper clearing

const player = new THREE.Group();
player.add(camera);
scene.add(player);


document.body.appendChild( VRButton.createButton( renderer,sessionInit ) );


// const controls = new OrbitControls(camera, renderer.domElement);
// controls.maxPolarAngle = Math.PI * 0.495;
// controls.target.set(0, 10, 0);
// controls.minDistance = 40.0;
// controls.maxDistance = 200.0;

// // controllers

// controller1 = renderer.xr.getController( 0 );
// player.add( controller1 );

// controller2 = renderer.xr.getController( 1 );

// player.add( controller2 );

// const controllerModelFactory = new XRControllerModelFactory();

// // Controller 1
// controller1 = renderer.xr.getController(0);
// player.add(controller1);

// controllerGrip1 = renderer.xr.getControllerGrip(0);
// controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
// player.add(controllerGrip1);

// // Controller 2
// controller2 = renderer.xr.getController(1);
// player.add(controller2);

// controllerGrip2 = renderer.xr.getControllerGrip(1);
// controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
// player.add(controllerGrip2);

// // Hand 1
// hand1 = renderer.xr.getHand( 0 );
// hand1.add( new OculusHandModel( hand1 ) );
// const handPointer1 = new OculusHandPointerModel( hand1, controller1 );
// hand1.add( handPointer1 );
// player.add( hand1 );

// // Hand 2
// hand2 = renderer.xr.getHand( 1 );
// hand2.add( new OculusHandModel( hand2 ) );
// const handPointer2 = new OculusHandPointerModel( hand2, controller2 );
// hand2.add( handPointer2 );
// player.add( hand2 );

// const geom = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

// const line = new THREE.Line( geom );
// line.name = 'line';
// line.scale.z = 5;

// controller1.add( line.clone() );
// controller2.add( line.clone() );

// function handleControllerMovement() {
//   const session = renderer.xr.getSession();
//   if (!session) return;

//   for (const source of session.inputSources) {
//     if (!source.gamepad) continue; // skip if no gamepad

//     const axes = source.gamepad.axes; // [xAxis, yAxis, ...]\ 
//     // Apply deadzone (avoid drift)
//     const deadzone = 0.15;
//     if (source.handedness === "left") {
//       // Left controller → XY walking
//       const lx = axes[2] || axes[0]; // left/right stick (varies by headset)
//       const ly = axes[3] || axes[1]; // forward/back stick

//       const moveX = Math.abs(lx) > deadzone ? lx : 0;
//       const moveY = Math.abs(ly) > deadzone ? ly : 0;

//       if (moveX !== 0 || moveY !== 0) {
//         movePlayerHorizontal(moveX, moveY);
//       }
//     }

//         if (source.handedness === "right") {
//       // Right controller → vertical
//       const ry = axes[3] || axes[1] || 0; 
//       // some headsets report right stick Y on axes[1], fallback if needed
//       const vertical = Math.abs(ry) > deadzone ? ry : 0;

//       if (vertical !== 0) {
//         movePlayerVertical(vertical);
//       }
//     }
    
//   }
// }



// function movePlayerHorizontal(x, y) {
//   const speed = 1.0;

//   // Get the headset forward direction
//   const dir = new THREE.Vector3(0, 0, -1);
//   dir.applyQuaternion(camera.quaternion);
//   dir.y = 0; // stay horizontal
//   dir.normalize();

//   // Strafe direction (right vector)
//   const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

//   // Move player rig
//   player.position.addScaledVector(dir, -y * speed);     // forward/back
//   player.position.addScaledVector(strafe, x * speed);   // left/right
// }


// function movePlayerVertical(y) {
//   const speed = 1.0;
//   player.position.y += -y * speed; 
//   // negative because stick up is usually negative
// }








video.addEventListener("playing", () => {
  videoTexture.needsUpdate = true;
});




window.addEventListener(
  "resize",
  function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
  },
  false
);
const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

const ws = new WebSocket("wss://localhost:3001"); // connect to streamer server

ws.onopen = () => {
  console.log("Connected to signaling server (headset)");
  ws.send(JSON.stringify({ role: "headset" })); // register as headset
};

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

let time;
function render() {
  time = performance.now() * 0.001;
  if (video.readyState >= video.HAVE_CURRENT_DATA) {
  videoTexture.needsUpdate = true;
  }
  renderer.render(scene, camera);
}
const dc = pc.createDataChannel("camera");
dc.onopen = () => console.log("Data channel open");
// Send camera updates through data channel instead of socket.emit
    function sendCameraUpdate() {
        const posQuat = {
            position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            quaternion: { w: camera.quaternion.w, x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z }
        };
        if (dc.readyState === "open") {
            dc.send(JSON.stringify(posQuat));
        }
    }






// async function startWebRTC() {
    
//     // Attach remote stream
//     const capabilities = RTCRtpReceiver.getCapabilities('video');
//     const h264Codecs = capabilities.codecs.filter(codec => codec.mimeType === 'video/H264');
//     pc.addTransceiver("video").setCodecPreferences(h264Codecs);

    
//     pc.onconnectionstatechange = () => console.log("PC state:", pc.connectionState);
//     pc.oniceconnectionstatechange = () => console.log("ICE state:", pc.iceConnectionState);
//     // Create data channel if needed for sending camera updates
//     pc.onicecandidate = (event) => {
//     if (event.candidate) {
//         fetch("/candidate", {
//         method: "POST",
//         body: JSON.stringify({candidate: event.candidate.candidate,
//         sdpMid: event.candidate.sdpMid,
//         sdpMLineIndex: event.candidate.sdpMLineIndex}),
//         headers: { "Content-Type": "application/json" },
//         });
//     }
//     };

//     // Create offer to backend
//     const offer = await pc.createOffer({ offerToReceiveVideo: true });
//     await pc.setLocalDescription(offer);

//     // Send offer to backend
//     const resp = await fetch("/offer", {
//         method: "POST",
//         body: JSON.stringify(pc.localDescription),
//         headers: { "Content-Type": "application/json" },
//     });
//     const answer = await resp.json();
//     await pc.setRemoteDescription(answer);
// }

// startWebRTC();
renderer.setAnimationLoop(function () {
    // INTERSECTION = undefined;
    //         if (controller1.userData.isSelecting) {
    //             tempMatrix.identity().extractRotation(controller1.matrixWorld);
    //             raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
    //             raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    //             const intersects = raycaster.intersectObjects([floor]);
    //             if (intersects.length > 0) INTERSECTION = intersects[0].point;
    //         } else if (controller2.userData.isSelecting) {
    //             tempMatrix.identity().extractRotation(controller2.matrixWorld);
    //             raycaster.ray.origin.setFromMatrixPosition(controller2.matrixWorld);
    //             raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    //             const intersects = raycaster.intersectObjects([floor]);
    //             if (intersects.length > 0) INTERSECTION = intersects[0].point;
    //         }

    //         if (INTERSECTION) marker.position.copy(INTERSECTION);
    //         marker.visible = INTERSECTION !== undefined;

            sendCameraUpdate();
  // handleControllerMovement();
  render();
});








        


    

     
        // let raycaster, controller1, controller2, controllerGrip1, controllerGrip2;
        // let marker, floor, baseReferenceSpace, INTERSECTION;
        const tempMatrix = new THREE.Matrix4();


     

    //     scene.add(camera); // Ensure camera is in the scene
    //     camera.layers.enable(1);
    //     camera.layers.enable(2);
    //     marker = new THREE.Mesh(
    //         new THREE.CircleGeometry(0.25, 32).rotateX(-Math.PI / 2),
    //         new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide , transparent: true, opacity: 1.0 })
    //     );
    //     marker.material.depthTest = false;
    //     marker.material.depthWrite = false;
    //     marker.renderOrder = 1000;
    //     scene.add(marker);

    //     floor = new THREE.Mesh(
    //         new THREE.PlaneGeometry(1000, 1000, 50,50).rotateX(-Math.PI / 2),
    //         new THREE.MeshBasicMaterial({ color: 0x000000,wireframe: true})
    //     );
    //     floor.material.depthTest = false;   // ignores depth buffer
    //     floor.renderOrder = 999;   
    //     scene.add(floor);

    //     raycaster = new THREE.Raycaster();
    //     const sendInterval = 1000 / 20; // 20 Hz
    //     let lastPosition = camera.position.clone();
    //     let lastQuaternion = camera.quaternion.clone();
    //     let lastSendTime = 0;

        
    //     function onSelectStart() { this.userData.isSelecting = true; }
    // function onSelectEnd() {
    // this.userData.isSelecting = false;
    // if (INTERSECTION) {
    //     const offsetPosition = { x: -INTERSECTION.x, y: -INTERSECTION.y, z: -INTERSECTION.z, w: 1 };
    //     const offsetRotation = new THREE.Quaternion();
    //     const transform = new XRRigidTransform(offsetPosition, offsetRotation);
    //     const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace(transform);
    //     renderer.xr.setReferenceSpace(teleportSpaceOffset);
    //     }
    // }

    //     controller1 = renderer.xr.getController(0);
    //     controller1.addEventListener("selectstart", onSelectStart);
    //     controller1.addEventListener("selectend", onSelectEnd);
    //     scene.add(controller1);

    //     controller2 = renderer.xr.getController(1);
    //     controller2.addEventListener("selectstart", onSelectStart);
    //     controller2.addEventListener("selectend", onSelectEnd);
    //     scene.add(controller2);

    //     const controllerModelFactory = new XRControllerModelFactory();
    //     controllerGrip1 = renderer.xr.getControllerGrip(0);
    //     controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    //     scene.add(controllerGrip1);

    //     controllerGrip2 = renderer.xr.getControllerGrip(1);
    //     controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    //     scene.add(controllerGrip2);







    //     renderer.xr.addEventListener('sessionstart', () => {
    //         console.log("VR session started");
    //         baseReferenceSpace = renderer.xr.getReferenceSpace();
    //     });