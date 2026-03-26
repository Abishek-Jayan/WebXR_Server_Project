import * as THREE from "three";
import { VRButton } from './jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from './jsm/webxr/XRControllerModelFactory.js';
import { NRRDLoader } from './jsm/loaders/NRRDLoader.js';
import rayMarchMaterial from "../image_server/public/raymarch.js";
import { USE_LARGE_FILE_LOADER, WORLD_MAX, NRRD_URL, MAX_SLABS } from "../image_server/public/env.js";
import Stats from './jsm/libs/stats.module.js';

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



const maxDim = Math.max(sx, sy, sz);

const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ShaderMaterial({
        uniforms: rayMarchMaterial.uniforms,
        vertexShader: rayMarchMaterial.vertexShader,
        fragmentShader: rayMarchMaterial.fragmentShader,
        side: THREE.BackSide,
        transparent: true,
    })
);
mesh.scale.set((sx / maxDim) * WORLD_MAX, (sy / maxDim) * WORLD_MAX, (sz / maxDim) * WORLD_MAX);
mesh.position.set(0, 1, 0);

// --- Camera & Renderer ---
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
renderer.xr.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.addEventListener("sessionstart", () => console.log("VR Session Started"));
document.body.appendChild(renderer.domElement);

// --- Player Rig ---
const player = new THREE.Group();
player.add(camera);
player.add(mesh);
scene.add(player);

// --- VR Button ---
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ["hand-tracking"] }));

// --- Controllers ---
const controllerModelFactory = new XRControllerModelFactory();
[0, 1].forEach(i => {
    const controller = renderer.xr.getController(i);
    player.add(controller);
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(controllerModelFactory.createControllerModel(grip));
    player.add(grip);
});

// --- Resize ---
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- FPS Logging ---
let _frameCount = 0;
let _lastFpsTime = performance.now();

// --- Animation Loop ---
renderer.setAnimationLoop(() => {
    stats.begin();

    _frameCount++;
    const now = performance.now();
    if (now - _lastFpsTime >= 2000) {
        const fps = (_frameCount / (now - _lastFpsTime) * 1000).toFixed(1);
        console.log(`[BACKEND-FPS] ${fps} fps`);
        _frameCount = 0;
        _lastFpsTime = now;
    }

    renderer.render(scene, camera);
    stats.end();
});
