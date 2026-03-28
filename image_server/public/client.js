import * as THREE from "three";
import { OrbitControls } from "./jsm/controls/OrbitControls.js";
import { VRButton} from './jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { CubemapToEquirectangular } from './CubeMaptoEquirect.js';
import { NRRDLoader } from './jsm/loaders/NRRDLoader.js';
import rayMarchMaterial, { MAX_SLABS } from "./raymarch.js";
import Stats from './jsm/libs/stats.module.js';
import { HOSTNAME, NRRD_URL, USE_LARGE_FILE_LOADER, RENDER_WIDTH, RENDER_HEIGHT, WORLD_MAX, INITIAL_IPD, MAX_BITRATE, MAX_FRAMERATE } from "./env.js";

const scene = new THREE.Scene();
const stats = new Stats();
document.body.appendChild(stats.dom);






async function loadTrad() {
    const nrrd = await new NRRDLoader().loadAsync(NRRD_URL);
    console.log(`NRRD data type: ${nrrd.data.constructor.name}`);
    const nrrdData = (nrrd.data instanceof Uint8Array || nrrd.data instanceof Uint8ClampedArray)
        ? nrrd.data
        : new Uint8Array(nrrd.data.buffer, nrrd.data.byteOffset, nrrd.data.byteLength);
    const expectedVoxels = nrrd.xLength * nrrd.yLength * nrrd.zLength;
    console.log(`Expected: ${expectedVoxels}, Actual: ${nrrdData.length}, Ratio: ${nrrdData.length / expectedVoxels}`);
    console.log(`Voxel dimensions: ${nrrd.xLength} x ${nrrd.yLength} x ${nrrd.zLength}`);
    console.log(`Voxel spacing: ${JSON.stringify(nrrd.spaceDirections || nrrd.pixelDimensions || 'not available')}`);

    const texture3D = new THREE.Data3DTexture(nrrdData, nrrd.xLength, nrrd.yLength, nrrd.zLength);
    texture3D.format = THREE.RedFormat;
    texture3D.type = THREE.UnsignedByteType;
    texture3D.minFilter = THREE.LinearFilter;
    texture3D.magFilter = THREE.LinearFilter;
    texture3D.unpackAlignment = 1;
    texture3D.needsUpdate = true;

    const slabTextures = new Array(MAX_SLABS).fill(null);
    slabTextures[0] = texture3D;
    rayMarchMaterial.uniforms.volumeTextures.value = slabTextures;
    rayMarchMaterial.uniforms.slabStarts.value = [0, ...new Array(MAX_SLABS - 1).fill(0)];
    rayMarchMaterial.uniforms.slabEnds.value   = [1, ...new Array(MAX_SLABS - 1).fill(0)];
    rayMarchMaterial.uniforms.numSlabs.value   = 1;

    return { sx: nrrd.xLength, sy: nrrd.yLength, sz: nrrd.zLength };
}

async function loadLargeFiles() {
    const CHUNK_SIZE = 256 * 1024 * 1024; // 256 MB per compressed chunk
    const MAX_SLAB_BYTES = 1.5 * 1024 * 1024 * 1024;

    async function fetchNRRDHeader(url) {
        const resp = await fetch(url, { headers: { Range: 'bytes=0-8191' } });
        const text = new TextDecoder().decode(await resp.arrayBuffer());
        const sep = text.indexOf('\n\n');
        const fields = {};
        for (const line of text.substring(0, sep).split('\n')) {
            const ci = line.indexOf(':');
            if (ci < 0) continue;
            fields[line.substring(0, ci).trim()] = line.substring(ci + 1).trim();
        }
        const [xLength, yLength, zLength] = fields['sizes'].split(/\s+/).map(Number);
        const encoding = (fields['encoding'] || 'raw').trim();
        const type = (fields['type'] || 'uint8').trim();
        const endian = (fields['endian'] || 'little').trim();
        const dataOffset = sep + 2;

        let bytesPerVoxel = 1;
        if (['uint16', 'int16', 'short', 'ushort'].includes(type)) bytesPerVoxel = 2;
        else if (['float', 'uint32', 'int32', 'int'].includes(type)) bytesPerVoxel = 4;

        console.log(`NRRD: ${xLength}x${yLength}x${zLength}, encoding=${encoding}, type=${type}, endian=${endian}`);
        return { xLength, yLength, zLength, encoding, dataOffset, bytesPerVoxel, endian };
    }

    // Stream compressed chunks one-by-one into DecompressionStream, read out slab-sized pieces.
    // Peak memory: ~256 MB (one compressed chunk) + ~1.5 GB (one slab accumulator).
    async function loadSlabsStreaming(url, dataOffset, totalFileSize, xLength, yLength, zLength, numSlabs, slabDepth) {
        const ranges = [];
        for (let start = dataOffset; start < totalFileSize; start += CHUNK_SIZE)
            ranges.push({ start, end: Math.min(start + CHUNK_SIZE - 1, totalFileSize - 1) });

        console.log(`Loading ${(totalFileSize / 1e6).toFixed(0)} MB compressed in ${ranges.length} chunk(s)`);

        let rangeIdx = 0;
        const compressedStream = new ReadableStream({
            async pull(controller) {
                if (rangeIdx >= ranges.length) { controller.close(); return; }
                const { start, end } = ranges[rangeIdx++];
                const resp = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
                controller.enqueue(new Uint8Array(await resp.arrayBuffer()));
                console.log(`Compressed chunk ${rangeIdx}/${ranges.length} fetched`);
            }
        });

        const reader = compressedStream.pipeThrough(new DecompressionStream('gzip')).getReader();

        let pending = new Uint8Array(0);
        async function readExact(n) {
            while (pending.length < n) {
                const { value, done } = await reader.read();
                if (done) throw new Error('Decompression stream ended before all slabs were read');
                const merged = new Uint8Array(pending.length + value.length);
                merged.set(pending);
                merged.set(value, pending.length);
                pending = merged;
            }
            const out = pending.slice(0, n);
            pending = pending.slice(n);
            return out;
        }

        const sliceBytes = xLength * yLength;
        const results = [];
        for (let s = 0; s < numSlabs; s++) {
            const zStart = s * slabDepth;
            const zEnd   = Math.min(zStart + slabDepth, zLength);
            const chunk  = await readExact(sliceBytes * (zEnd - zStart));
            results.push({ chunk, zStart, zEnd });
            console.log(`Slab ${s + 1}/${numSlabs} decompressed`);
        }
        return results;
    }

    // Raw path: parallel Range requests, no decompression needed
    async function loadSlabsRaw(url, dataOffset, xLength, yLength, zLength, numSlabs, slabDepth, bytesPerVoxel, endian) {
        const sliceBytes = xLength * yLength * bytesPerVoxel;
        return Promise.all(Array.from({ length: numSlabs }, async (_, s) => {
            const zStart    = s * slabDepth;
            const zEnd      = Math.min(zStart + slabDepth, zLength);
            const byteStart = dataOffset + zStart * sliceBytes;
            const byteEnd   = dataOffset + zEnd   * sliceBytes - 1;
            const resp  = await fetch(url, { headers: { Range: `bytes=${byteStart}-${byteEnd}` } });
            let raw = new Uint8Array(await resp.arrayBuffer());

            if (bytesPerVoxel === 2) {
                if (endian === 'big') {
                    for (let i = 0; i < raw.length - 1; i += 2) {
                        const tmp = raw[i]; raw[i] = raw[i + 1]; raw[i + 1] = tmp;
                    }
                }
                // Normalize uint16 → uint8: >>5 maps mean→~49, P99→~220
                const u16 = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
                const u8  = new Uint8Array(u16.length);
                for (let i = 0; i < u16.length; i++) u8[i] = Math.min(255, u16[i] >> 5);
                raw = u8;
            }

            console.log(`Slab ${s + 1}/${numSlabs} fetched`);
            return { chunk: raw, zStart, zEnd };
        }));
    }

    const { xLength, yLength, zLength, encoding, dataOffset, bytesPerVoxel, endian } = await fetchNRRDHeader(NRRD_URL);

    const rawTotalBytes = xLength * yLength * zLength * bytesPerVoxel;
    const numSlabs      = Math.max(1, Math.ceil(rawTotalBytes / MAX_SLAB_BYTES));
    if (numSlabs > MAX_SLABS) throw new Error(`Volume requires ${numSlabs} slabs but MAX_SLABS is ${MAX_SLABS}. Reduce MAX_SLAB_BYTES or increase MAX_SLABS in raymarch.js.`);
    const slabDepth = Math.ceil(zLength / numSlabs);

    const totalBytes = xLength * yLength * zLength;
    console.log(`Volume: ${xLength}x${yLength}x${zLength}, ${(totalBytes / 1e9).toFixed(2)} GB → ${numSlabs} slab(s)`);

    let rawSlabs;
    if (encoding === 'gzip' || encoding === 'gz') {
        const head = await fetch(NRRD_URL, { method: 'HEAD' });
        const totalFileSize = parseInt(head.headers.get('Content-Length'), 10);
        rawSlabs = await loadSlabsStreaming(NRRD_URL, dataOffset, totalFileSize, xLength, yLength, zLength, numSlabs, slabDepth);
    } else {
        rawSlabs = await loadSlabsRaw(NRRD_URL, dataOffset, xLength, yLength, zLength, numSlabs, slabDepth, bytesPerVoxel, endian);
    }

    const slabTextures = [];
    const slabStarts = new Array(MAX_SLABS).fill(0);
    const slabEnds   = new Array(MAX_SLABS).fill(0);

    for (let s = 0; s < rawSlabs.length; s++) {
        const { chunk, zStart, zEnd } = rawSlabs[s];
        const depth = zEnd - zStart;
        const tex = new THREE.Data3DTexture(chunk, xLength, yLength, depth);
        tex.format = THREE.RedFormat;
        tex.type = THREE.UnsignedByteType;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.unpackAlignment = 1;
        tex.needsUpdate = true;
        slabTextures.push(tex);
        slabStarts[s] = zStart / zLength;
        slabEnds[s]   = zEnd   / zLength;
    }
    console.log("rayMarchMaterial =", rayMarchMaterial);
    console.log("uniforms =", rayMarchMaterial?.uniforms);
    rayMarchMaterial.uniforms.volumeTextures.value = slabTextures;
    rayMarchMaterial.uniforms.slabStarts.value = slabStarts;
    rayMarchMaterial.uniforms.slabEnds.value = slabEnds;
    rayMarchMaterial.uniforms.numSlabs.value = numSlabs;

    return { sx: xLength, sy: yLength, sz: zLength };
}

const { sx, sy, sz } = await (USE_LARGE_FILE_LOADER ? loadLargeFiles() : loadTrad());


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

const maxDim = Math.max(sx, sy, sz);

mesh.scale.set(
  (sx / maxDim) * WORLD_MAX,
  (sy / maxDim) * WORLD_MAX,
  (sz / maxDim) * WORLD_MAX
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

// Auto-enter VR as soon as the button is ready, without waiting for frontend signal
const vrAutoClick = setInterval(() => {
  if (vrButton.textContent === 'ENTER VR') {
    vrButton.click();
    clearInterval(vrAutoClick);
  }
}, 500);


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

const headsetForward = new THREE.Vector3(0, 0, -1); // default forward


function movePlayerHorizontal(x, y) {
  const speed = 0.05;

  // Get the headset forward direction
  const dir = new THREE.Vector3().copy(headsetForward);

  // Strafe direction (right vector)
  const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  // Move player rig
  newplayer.position.addScaledVector(dir, -y * speed);     // forward/back 
  newplayer.position.addScaledVector(strafe, -x * speed);   // left/right
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



			


let _pendingInputTs = null;
let _inputReceivedAt = null;
let _backendFrameCount = 0;
let _backendLastFpsTime = performance.now();
let _lastRaymarchMs = 0;
let _lastErpMs = 0;
let _avgEncodeMs = 0;

let pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});
pc.onconnectionstatechange = () => console.log("[WebRTC] connectionState:", pc.connectionState);
pc.oniceconnectionstatechange = () => console.log("[WebRTC] iceConnectionState:", pc.iceConnectionState);
pc.onicegatheringstatechange = () => console.log("[WebRTC] iceGatheringState:", pc.iceGatheringState);

const ws = new WebSocket(`wss://${HOSTNAME}:3001`); // connect to server.js

async function sendNewOffer() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  pc.getSenders().forEach(sender => {
    if (!sender.track || sender.track.kind !== 'video') return;
    const p = sender.getParameters();
    if (!p.encodings) p.encodings = [{}];
    Object.assign(p.encodings[0], {
      maxBitrate: MAX_BITRATE,
      maxFramerate: MAX_FRAMERATE,
      priority: "high",
      networkPriority: "high",
      scaleResolutionDownBy: 1.0
    });
    p.degradationPreference = 'maintain-resolution';
    sender.setParameters(p).catch(()=>{});
    const effective = sender.getParameters();
    console.log('encodings after setParameters', effective.encodings);
    try { sender.track.contentHint = 'detail'; } catch {}
  });
  ws.send(JSON.stringify({ role: "streamer", type: "offer", offer: pc.localDescription }));
  console.log("Sent offer to server");
}

ws.onopen = async () => {
  console.log("Connected to signaling server (streamer)");
  ws.send(JSON.stringify({ role: "streamer" }));
  await sendNewOffer();
};


let newcamLeft = new THREE.PerspectiveCamera(75, RENDER_WIDTH / RENDER_HEIGHT, 0.1, 1000);
let newcamRight = new THREE.PerspectiveCamera(75, RENDER_WIDTH / RENDER_HEIGHT, 0.1, 1000);





let ipd = INITIAL_IPD;
newcamLeft.position.set(-ipd / 2, 0, 0);
newcamRight.position.set(ipd / 2, 0, 0);
const newplayer = new THREE.Group();
newplayer.add(newcamLeft);
newplayer.add(newcamRight);
scene.add(newplayer);


ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  
  
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
    if (data._t !== undefined) { _pendingInputTs = data._t; _inputReceivedAt = performance.now(); }
    handleControllerMovement("left",data.lx,data.ly,0);
  }
  if(data.type === "right")
  {
    if (data._t !== undefined) { _pendingInputTs = data._t; _inputReceivedAt = performance.now(); }
    handleControllerMovement("right",0,0,data.ry);
  }
 if(data.type === "pose") {
  const q = data.quaternion;

  const forward = new THREE.Vector3(0, 0, -1); // camera looks down -Z
  forward.applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w).invert());

  // Optional: ignore vertical component so movement is on XZ plane
  forward.y = 0;
  forward.normalize();

  headsetForward.copy(forward);
  }

  if (data.type === "headset_joined") {
    await reinitWebRTC();
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
const streamRenderer = new THREE.WebGLRenderer({
  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
});
streamRenderer.setSize(RENDER_WIDTH, RENDER_HEIGHT * 2);

const cubeMapSize = RENDER_WIDTH;
const options = { format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
const renderTarget = new THREE.WebGLCubeRenderTarget(cubeMapSize, options);
const cubeCamera = new THREE.CubeCamera(0.1, 2000, renderTarget);

const equiLeft  = new CubemapToEquirectangular(streamRenderer, cubeCamera, renderTarget, RENDER_WIDTH, RENDER_HEIGHT);
const equiRight = new CubemapToEquirectangular(streamRenderer, cubeCamera, renderTarget, RENDER_WIDTH, RENDER_HEIGHT);

const combinedStream = streamRenderer.domElement.captureStream();
combinedStream.getTracks().forEach((track) => pc.addTrack(track, combinedStream));

async function reinitWebRTC() {
  console.log("[WebRTC] Reinitializing connection");
  pc.close();
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.onconnectionstatechange = () => console.log("[WebRTC] connectionState:", pc.connectionState);
  pc.oniceconnectionstatechange = () => console.log("[WebRTC] iceConnectionState:", pc.iceConnectionState);
  pc.onicegatheringstatechange = () => console.log("[WebRTC] iceGatheringState:", pc.iceGatheringState);
  pc.onicecandidate = (event) => {
    if (event.candidate) ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
  };
  combinedStream.getTracks().forEach(track => pc.addTrack(track, combinedStream));
  await sendNewOffer();
}


// Poll outbound-rtp for average encode time per frame and bandwidth
const _encodePrev = {};
const _BW_INTERVAL_MS = 2000;
setInterval(async () => {
  if (pc.connectionState !== 'connected') return;
  const stats = await pc.getStats();
  stats.forEach(report => {
    if (report.type !== 'outbound-rtp' || report.kind !== 'video') return;
    const p = _encodePrev[report.ssrc] || {};
    const dtEncode = (report.totalEncodeTime || 0) - (p.totalEncodeTime || 0);
    const dtFrames = (report.framesEncoded || 0) - (p.framesEncoded || 0);
    if (dtFrames > 0) _avgEncodeMs = (dtEncode / dtFrames) * 1000;

    const dtBytes = (report.bytesSent || 0) - (p.bytesSent || 0);
    const mbps = (dtBytes * 8) / (_BW_INTERVAL_MS / 1000) / 1e6;
    console.log(`[BANDWIDTH] ${mbps.toFixed(2)} Mbps (${(dtBytes / 1024).toFixed(0)} KB in ${_BW_INTERVAL_MS}ms)`);

    _encodePrev[report.ssrc] = { totalEncodeTime: report.totalEncodeTime, framesEncoded: report.framesEncoded, bytesSent: report.bytesSent };
  });
}, _BW_INTERVAL_MS);

renderer.setAnimationLoop(function () {
  const _frameStartMs = performance.now();
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

  // Left eye → top half of canvas
  streamRenderer.setScissor(0, RENDER_HEIGHT, RENDER_WIDTH, RENDER_HEIGHT);
  streamRenderer.setViewport(0, RENDER_HEIGHT, RENDER_WIDTH, RENDER_HEIGHT);
  equiLeft.update(newcamLeft, scene);

  // Right eye → bottom half
  streamRenderer.setScissor(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
  streamRenderer.setViewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
  equiRight.update(newcamRight, scene);

  _lastRaymarchMs = (equiLeft.lastRaymarchMs || 0) + (equiRight.lastRaymarchMs || 0);
  _lastErpMs = (equiLeft.lastErpMs || 0) + (equiRight.lastErpMs || 0);


  _backendFrameCount++;
  const _now = performance.now();
  if (_now - _backendLastFpsTime >= 2000) {
    const fps = (_backendFrameCount / (_now - _backendLastFpsTime) * 1000).toFixed(1);
    console.log(`[BACKEND-FPS] ${fps} fps`);
    _backendFrameCount = 0;
    _backendLastFpsTime = _now;
  }

  if (_pendingInputTs !== null && ws.readyState === WebSocket.OPEN) {
    const frameWaitMs = _inputReceivedAt !== null ? _frameStartMs - _inputReceivedAt : 0;
    ws.send(JSON.stringify({ type: "render_ack", t: _pendingInputTs, raymarchMs: _lastRaymarchMs, erpMs: _lastErpMs, encodeMs: _avgEncodeMs, frameWaitMs }));
    _pendingInputTs = null;
    _inputReceivedAt = null;
  }
  renderer.render(scene,camera);
  stats.end();

  
});

