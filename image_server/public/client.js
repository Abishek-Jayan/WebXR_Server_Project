import * as THREE from "three";
import { OrbitControls } from "./jsm/controls/OrbitControls.js";
import { VRButton} from './jsm/webxr/VRButton.js';
import { GLTFLoader } from "./jsm/loaders/GLTFLoader.js";
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from './jsm/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from './jsm/webxr/OculusHandPointerModel.js';
import { PDBLoader } from './jsm/loaders/PDBLoader.js';
import { CubemapToEquirectangular } from './CubeMaptoEquirect.js';


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

// instantiate a loader
const loader = new PDBLoader();
// === Lights (add once, outside the loader if you want) ===
const ambientLight = new THREE.AmbientLight(0x404040, 10); // soft white
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight);
// load a PDB resource
loader.load(
	// resource URL
	'./8HTI.pdb',
	// called when the resource is loaded
	function ( pdb ) {

    const geometryAtoms = pdb.geometryAtoms;
    const geometryBonds = pdb.geometryBonds;
    const json = pdb.json;
    console.log(json);
    console.log('This molecule has ' + json.atoms.length + ' atoms');
    // console.log('This molecule has ' + json.bonds.length + ' bonds');

    // Atom colors by element
    const atomColors = {
      H: 0xffffff, // white
      C: 0xaaaaaa, // gray
      O: 0xff0000, // red
      N: 0x0000ff, // blue
      S: 0xffff00, // yellow
      P: 0xff8000  // orange
    };

    const sphereGeometry = new THREE.IcosahedronGeometry(0.25, 2);
    // === Compute center of all atoms ===
    const positions = json.atoms.map(atom => new THREE.Vector3().fromArray(atom, 0));
    const boundingBox = new THREE.Box3().setFromPoints(positions);
    const center = boundingBox.getCenter(new THREE.Vector3());
    

    // === Atoms ===
    for (let i = 0; i < json.atoms.length; i++) {
      const atom = json.atoms[i]; // [x, y, z, index, element]
      const position = new THREE.Vector3().fromArray(atom, 0).sub(center);
      const element = atom[4]; // element symbol
      const color = atomColors[element] || 0xcccccc;

      const material = new THREE.MeshPhongMaterial({ color });
      const atomMesh = new THREE.Mesh(sphereGeometry, material);
      atomMesh.position.copy(position);
      scene.add(atomMesh);
    }

    // === Bonds ===
    const bondPositions = geometryBonds.attributes.position;
    const bondMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });

    function createBond(start, end, material) {
      const bondLength = start.distanceTo(end);
      const bondGeometry = new THREE.CylinderGeometry(0.1, 0.1, bondLength, 8,1);
      const bondMesh = new THREE.Mesh(bondGeometry, material);

      // Position
      const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      bondMesh.position.copy(midpoint);

      // Align cylinder with bond direction
      const dir = new THREE.Vector3().subVectors(end, start).normalize();
      const yAxis = new THREE.Vector3(0, 1, 0);

      // If dir is already parallel to yAxis, avoid zero cross product
      if (Math.abs(dir.dot(yAxis)) > 0.999) {
        bondMesh.quaternion.set(0, 0, 0, 1); // identity rotation
      } else {
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
        bondMesh.quaternion.copy(quat);
      }

      return bondMesh;
    }


        for (let i = 0; i < json.atoms.length - 1; i++) {
          const atom1 = json.atoms[i];
          const atom2 = json.atoms[i + 1];

          // Only connect backbone atoms (N, CA, C)
          if ((atom1[4] === "N" || atom1[4] === "CA" || atom1[4] === "C") &&
              (atom2[4] === "N" || atom2[4] === "CA" || atom2[4] === "C")) {
            
            const start = new THREE.Vector3().fromArray(atom1, 0).sub(center);
            const end = new THREE.Vector3().fromArray(atom2, 0).sub(center);

            const bondMesh = createBond(start, end, new THREE.MeshPhongMaterial({ color: 0xcccccc }));
            scene.add(bondMesh);
              }
	  } 
  },
	// called when loading is in progress
	function ( xhr ) {

		console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

	},
	// called when loading has errors
	function ( error ) {

		console.log( 'An error happened' );

	}
);



// const loader = new GLTFLoader();
// loader.load(
//   "/BSP_TORRENS.glb", // adjust the path to where your file is
//   function (gltf) {
//     const model = gltf.scene;
//     model.position.set(0, 0, 0); // adjust position
//     model.scale.set(10, 10, 10); // adjust scale
//     scene.add(model);
//   },
//   undefined,
//   function (error) {
//     console.error("An error occurred while loading the GLB:", error.message || error);
//   }
// );

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:"high-performance", preserveDrawingBuffer: true, alpha: false});
renderer.xr.enabled = true;
renderer.xr.addEventListener("sessionstart", ()=> {
  console.log("VR Session Started");
});



const renderWidth = 1920; // desired output width
const renderHeight = 1080; // desired output height
renderer.setSize(renderWidth, renderHeight, false); // 'false' preserves canvas CSS size


renderer.domElement.style.width = window.innerWidth + "px";
renderer.domElement.style.height = window.innerHeight + "px";


document.body.appendChild(renderer.domElement);

const sessionInit = {
					optionalFeatures: [ 'hand-tracking' ]
				};

const player = new THREE.Group();
player.add(camera);
scene.add(player);
const vrButton =  VRButton.createButton( renderer )
document.body.appendChild(vrButton);


const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 10, 0);
controls.minDistance = 40.0;
controls.maxDistance = 200.0;

// controllers

controller1 = renderer.xr.getController( 0 );
player.add( controller1 );

controller2 = renderer.xr.getController( 1 );

player.add( controller2 );

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
      // some headsets report right stick Y on axes[1], fallback if needed
      const vertical = Math.abs(ry) > deadzone ? ry : 0;

      if (vertical !== 0) {
        movePlayerVertical(vertical);
      }
    }
    
  
}



function movePlayerHorizontal(x, y) {
  const speed = 1.0;

  // Get the headset forward direction
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(player.quaternion);
  dir.y = 0; // stay horizontal
  dir.normalize();

  // Strafe direction (right vector)
  const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  // Move player rig
  player.position.addScaledVector(dir, -y * speed);     // forward/back // FIXED: changed newplayer to player (assuming this is for local controls; adjust if remote)
  player.position.addScaledVector(strafe, x * speed);   // left/right
}


function movePlayerVertical(y) {
  const speed = 1.0;
  player.position.y += -y * speed; // FIXED: changed newplayer to player
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



			

let time;

const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});



const ws = new WebSocket(`wss://10.24.46.139:3001`); // connect to server.js

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
  const offer = await pc.createOffer({ offerToReceiveVideo: true });
  offer.sdp = preferH264(offer.sdp);
  await pc.setLocalDescription(offer);
  pc.getSenders().forEach(sender => {
    if (!sender.track || sender.track.kind !== 'video') return;
    const p = sender.getParameters();
    if (!p.encodings) p.encodings = [{}];
    Object.assign(p.encodings[0], {
    maxBitrate: 10_000_000,     // start ~10 Mbps per stream; tune up/down
    maxFramerate: 90,           // match capture target
    scaleResolutionDownBy: 2.0  // raise (e.g., 1.25–2) if encoder is the bottleneck
    });
    p.degradationPreference = 'maintain-framerate';
    sender.setParameters(p).catch(()=>{});
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





const ipd = 0.03;
newcamLeft.position.set(-ipd / 2, 0, 0);
newcamRight.position.set(ipd / 2, 0, 0);
let flag = true;
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
  if (data.type === "left")
  {
    handleControllerMovement("left",data.lx,data.ly,0);
  }
  if(data.type === "right")
  {
    handleControllerMovement("right",0,0,data.ry);
  }
 if(data.type === "pose") {
    newplayer.quaternion.set(
      data.quaternion.x,
      data.quaternion.y,
      data.quaternion.z,
      data.quaternion.w
    );
    // newplayer.position.set(
    //   data.position.x,
    //   data.position.y,
    //   data.position.z,
    // );

  }

  if (data.type === "answer") {
    console.log("Received answer from headset");
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  
  if (data.type === "candidate") {
    console.log("Received ICE candidate from headset");
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
        role: "streamer",
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

const cubeMapSize = 1920;
const options = { format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
const renderTarget = new THREE.WebGLCubeRenderTarget(cubeMapSize, options);
const cubeCamera = new THREE.CubeCamera(0.1, 25, renderTarget);



const equiLeft = new CubemapToEquirectangular(streamRendererLeft, cubeCamera, renderTarget);
const equiRight = new CubemapToEquirectangular(streamRendererRight, cubeCamera, renderTarget);

// Add stream
const streamLeft = streamRendererLeft.domElement.captureStream();
streamLeft.getTracks().forEach((track) => pc.addTrack(track, streamLeft));
const streamRight = streamRendererRight.domElement.captureStream();
streamRight.getTracks().forEach((track) => pc.addTrack(track, streamRight));





renderer.setAnimationLoop(function () {

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion);

  newcamLeft.position.copy(player.position).addScaledVector(right, -ipd/2);
  newcamRight.position.copy(player.position).addScaledVector(right, ipd/2);

  newcamLeft.quaternion.copy(player.quaternion);
  newcamRight.quaternion.copy(player.quaternion);

  equiLeft.update(newcamLeft, scene);
  equiRight.update(newcamRight, scene);


  

  
});

