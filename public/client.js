/**
 * Work based on the Three JS Ocean examples at
 * https://threejs.org/examples/?q=water#webgl_shaders_ocean
 */
import * as THREE from "three";
import { OrbitControls } from "./jsm/controls/OrbitControls.js";
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

// instantiate a loader
// const loader = new PDBLoader();
// // === Lights (add once, outside the loader if you want) ===
// const ambientLight = new THREE.AmbientLight(0x404040, 2); // soft white
// scene.add(ambientLight);

// const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
// directionalLight.position.set(1, 1, 1).normalize();
// scene.add(directionalLight);
// // load a PDB resource
// loader.load(
// 	// resource URL
// 	'./8HTI.pdb',
// 	// called when the resource is loaded
// 	function ( pdb ) {

//         const geometryAtoms = pdb.geometryAtoms;
//     const geometryBonds = pdb.geometryBonds;
//     const json = pdb.json;

//     console.log('This molecule has ' + json.atoms.length + ' atoms');

//     // Atom colors by element
//     const atomColors = {
//       H: 0xffffff, // white
//       C: 0xaaaaaa, // gray
//       O: 0xff0000, // red
//       N: 0x0000ff, // blue
//       S: 0xffff00, // yellow
//       P: 0xff8000  // orange
//     };

//     const sphereGeometry = new THREE.IcosahedronGeometry(0.25, 2);

//     // === Atoms ===
//     for (let i = 0; i < json.atoms.length; i++) {
//       const atom = json.atoms[i]; // [x, y, z, index, element]
//       const position = new THREE.Vector3().fromArray(atom, 0);
//       const element = atom[4]; // element symbol
//       const color = atomColors[element] || 0xcccccc;

//       const material = new THREE.MeshPhongMaterial({ color });
//       const atomMesh = new THREE.Mesh(sphereGeometry, material);
//       atomMesh.position.copy(position);
//       scene.add(atomMesh);
//     }

//     // === Bonds ===
//     const bondPositions = geometryBonds.attributes.position;
//     const bondMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc });

//     function createBond(start, end, material) {
//       const bondLength = start.distanceTo(end);
//       const bondGeometry = new THREE.CylinderGeometry(0.05, 0.05, bondLength, 8);
//       const bondMesh = new THREE.Mesh(bondGeometry, material);

//       // Position
//       const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
//       bondMesh.position.copy(midpoint);

//       // Orientation
//       const dir = new THREE.Vector3().subVectors(end, start).normalize();
//       const axis = new THREE.Vector3(0, 1, 0).cross(dir);
//       const angle = Math.acos(dir.dot(new THREE.Vector3(0, 1, 0)));
//       bondMesh.quaternion.setFromAxisAngle(axis.normalize(), angle);

//       return bondMesh;
//     }

//     for (let i = 0; i < bondPositions.count; i += 2) {
//       const start = new THREE.Vector3().fromBufferAttribute(bondPositions, i);
//       const end = new THREE.Vector3().fromBufferAttribute(bondPositions, i + 1);

//       const bondMesh = createBond(start, end, bondMaterial.clone());
//       scene.add(bondMesh);
//     }
// 		console.log( 'This molecule has ' + json.atoms.length + ' atoms' );

// 	},
// 	// called when loading is in progress
// 	function ( xhr ) {

// 		console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

// 	},
// 	// called when loading has errors
// 	function ( error ) {

// 		console.log( 'An error happened' );

// 	}
// );



const loader = new GLTFLoader();
loader.load(
  "./BSP_TORRENS.glb", // adjust the path to where your file is
  function (gltf) {
    const model = gltf.scene;
    model.position.set(0, 0, 0); // adjust position
    model.scale.set(10, 10, 10); // adjust scale
    scene.add(model);
  },
  undefined,
  function (error) {
    console.error("An error occurred while loading the GLB:", error);
  }
);

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:"high-performance"});
renderer.xr.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const sessionInit = {
					optionalFeatures: [ 'hand-tracking' ]
				};

const player = new THREE.Group();
player.add(camera);
scene.add(player);


document.body.appendChild( VRButton.createButton( renderer,sessionInit ) );


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
    const deadzone = 0.15;
    if (source.handedness === "left") {
      // Left controller → XY walking
      const lx = axes[2] || axes[0]; // left/right stick (varies by headset)
      const ly = axes[3] || axes[1]; // forward/back stick

      const moveX = Math.abs(lx) > deadzone ? lx : 0;
      const moveY = Math.abs(ly) > deadzone ? ly : 0;

      if (moveX !== 0 || moveY !== 0) {
        movePlayerHorizontal(moveX, moveY);
      }
    }

        if (source.handedness === "right") {
      // Right controller → vertical
      const ry = axes[3] || axes[1] || 0; 
      // some headsets report right stick Y on axes[1], fallback if needed
      const vertical = Math.abs(ry) > deadzone ? ry : 0;

      if (vertical !== 0) {
        movePlayerVertical(vertical);
      }
    }
    
  }
}



function movePlayerHorizontal(x, y) {
  const speed = 1.0;

  // Get the headset forward direction
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(camera.quaternion);
  dir.y = 0; // stay horizontal
  dir.normalize();

  // Strafe direction (right vector)
  const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  // Move player rig
  player.position.addScaledVector(dir, -y * speed);     // forward/back
  player.position.addScaledVector(strafe, x * speed);   // left/right
}


function movePlayerVertical(y) {
  const speed = 1.0;
  player.position.y += -y * speed; 
  // negative because stick up is usually negative
}

const sun = new THREE.Vector3();
const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
const water = new Water(waterGeometry, {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals: new THREE.TextureLoader(),
  alpha: 1.0,
  sunDirection: new THREE.Vector3(),
  sunColor: 0xffffff,
  waterColor: 0x001e0f,
  distortionScale: 3.7,
  fog: scene.fog !== undefined,
});
water.rotation.x = -Math.PI / 2;

// scene.add(water);

const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);

let uniforms = sky.material.uniforms;
uniforms["turbidity"].value = 10;
uniforms["rayleigh"].value = 2;
uniforms["mieCoefficient"].value = 0.005;
uniforms["mieDirectionalG"].value = 0.8;

const parameters = {
  inclination: 0.49,
  azimuth: 0.205,
};

const pmremGenerator = new THREE.PMREMGenerator(renderer);

function updateSun() {
  var theta = Math.PI * (parameters.inclination - 0.5);
  var phi = 2 * Math.PI * (parameters.azimuth - 0.5);

  sun.x = Math.cos(phi);
  sun.y = Math.sin(phi) * Math.sin(theta);
  sun.z = Math.sin(phi) * Math.cos(theta);

  sky.material.uniforms["sunPosition"].value.copy(sun);
  water.material.uniforms["sunDirection"].value.copy(sun).normalize();

  scene.environment = pmremGenerator.fromScene(sky).texture;
}

updateSun();

const geometry = new THREE.BoxGeometry(30, 30, 30);
const material = new THREE.MeshStandardMaterial({
  roughness: 0,
});

const cube = new THREE.Mesh(geometry, material);
// scene.add(cube);

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

const stats = Stats();
document.body.appendChild(stats.dom);

const gui = new GUI();

const skyFolder = gui.addFolder("Sky");
skyFolder.add(parameters, "inclination", 0, 0.5, 0.0001).onChange(updateSun);
skyFolder.add(parameters, "azimuth", 0, 1, 0.0001).onChange(updateSun);
skyFolder.open();

const waterFolder = gui.addFolder("Water");
waterFolder
  .add(water.material.uniforms.distortionScale, "value", 0, 8, 0.1)
  .name("distortionScale");
waterFolder
  .add(water.material.uniforms.size, "value", 0.1, 10, 0.1)
  .name("size");
waterFolder.open();

			

let time;
function render() {
  time = performance.now() * 0.001;

  cube.position.y = Math.sin(time) * 20 + 5;
  cube.rotation.x = time * 0.5;
  cube.rotation.z = time * 0.51;

  water.material.uniforms["time"].value += 1.0 / 60.0;

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(function () {
  handleControllerMovement();
  render();
  stats.update();
});