import * as THREE from "three";

export const MAX_SLABS = 8;

const material = new THREE.ShaderMaterial({

    uniforms: {
        volumeTextures: { value: new Array(MAX_SLABS).fill(null) },
        slabStarts:     { value: new Array(MAX_SLABS).fill(0) },
        slabEnds:       { value: new Array(MAX_SLABS).fill(0) },
        numSlabs:       { value: 1 },
    },

    vertexShader: `
        varying vec3 vOrigin;
        varying vec3 vDirection;

        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vec4 camInObject = inverse(modelMatrix) * vec4(cameraPosition, 1.0);
            vOrigin = camInObject.xyz;
            vDirection = position - vOrigin;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
    `,

    fragmentShader: `
        precision highp float;
        precision highp sampler3D;

        #define MAX_SLABS ${MAX_SLABS}

        uniform sampler3D volumeTextures[MAX_SLABS];
        uniform float slabStarts[MAX_SLABS];
        uniform float slabEnds[MAX_SLABS];
        uniform int numSlabs;

        varying vec3 vOrigin;
        varying vec3 vDirection;

        vec2 intersectBox(vec3 orig, vec3 dir, vec3 boxMin, vec3 boxMax) {
            vec3 invDir = 1.0 / dir;
            vec3 tminTemp = (boxMin - orig) * invDir;
            vec3 tmaxTemp = (boxMax - orig) * invDir;
            vec3 tmin = min(tminTemp, tmaxTemp);
            vec3 tmax = max(tminTemp, tmaxTemp);
            float t0 = max(max(tmin.x, tmin.y), tmin.z);
            float t1 = min(min(tmax.x, tmax.y), tmax.z);
            return vec2(t0, t1);
        }

        float sampleVolume(vec3 texPos) {
            ${Array.from({ length: MAX_SLABS }, (_, s) => `
            if (${s} < numSlabs && texPos.z >= slabStarts[${s}] && texPos.z <= slabEnds[${s}]) {
                float localZ = (texPos.z - slabStarts[${s}]) / (slabEnds[${s}] - slabStarts[${s}]);
                return texture(volumeTextures[${s}], vec3(texPos.xy, localZ)).r;
            }`).join('')}
            return 0.0;
        }

        void main() {
            vec3 rayDir = normalize(vDirection);

            vec3 boxMin = vec3(-0.5);
            vec3 boxMax = vec3(0.5);

            vec2 bounds = intersectBox(vOrigin, rayDir, boxMin, boxMax);
            if (bounds.x > bounds.y) discard;

            float t = max(bounds.x, 0.0);
            float tEnd = bounds.y;

            float accum = 0.0;
            const int STEPS = 64;
            float dt = (tEnd - t) / float(STEPS);

            for (int i = 0; i < STEPS; i++) {
                vec3 pos = vOrigin + rayDir * (t + float(i) * dt);
                vec3 texPos = pos + 0.5;
                float val = sampleVolume(texPos);
                accum += val * 0.02;
            }

            gl_FragColor = vec4(accum, accum, accum, 1.0);
        }
    `,

    side: THREE.BackSide,
    transparent: true
});

export default material;
