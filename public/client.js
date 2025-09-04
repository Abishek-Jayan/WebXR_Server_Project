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
import { XRHandModelFactory } from './jsm/webxr/XRHandModelFactory.js';


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

const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.xr.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const sessionInit = {
					requiredFeatures: [ 'hand-tracking' ]
				};




document.body.appendChild( VRButton.createButton( renderer,sessionInit ) );


const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 10, 0);
controls.minDistance = 40.0;
controls.maxDistance = 200.0;

// controllers

controller1 = renderer.xr.getController( 0 );
scene.add( controller1 );

controller2 = renderer.xr.getController( 1 );
scene.add( controller2 );

const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();

// Hand 1
controllerGrip1 = renderer.xr.getControllerGrip( 0 );
controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
scene.add( controllerGrip1 );

hand1 = renderer.xr.getHand( 0 );
hand1.add( handModelFactory.createHandModel( hand1 ) );

scene.add( hand1 );

// Hand 2
controllerGrip2 = renderer.xr.getControllerGrip( 1 );
controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
scene.add( controllerGrip2 );

hand2 = renderer.xr.getHand( 1 );
hand2.add( handModelFactory.createHandModel( hand2 ) );
scene.add( hand2 );

const geom = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

const line = new THREE.Line( geom );
line.name = 'line';
line.scale.z = 5;

controller1.add( line.clone() );
controller2.add( line.clone() );


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
// scene.add(sky);

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

// function animate() {
//   requestAnimationFrame(animate);
//   render();
//   stats.update();
// }

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
  render();
  stats.update();
});