import * as THREE from "three";

const material = new THREE.ShaderMaterial({

    uniforms: {
        volumeTex: { value: null },                   // ← You fill these in later
        dims:      { value: new THREE.Vector3(1,1,1) }
    },

    
    vertexShader: `
        // vertexShader
        varying vec3 vOrigin;
        varying vec3 vDirection;

        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vec4 camInObject = inverse(modelMatrix) * vec4(cameraPosition, 1.0);
            vOrigin = camInObject.xyz;
            vDirection = position - vOrigin;   // ray toward this fragment in object space
            gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
    `,

    fragmentShader: `
        precision highp float;
        precision highp sampler3D;

        uniform sampler3D volumeTex;

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

        void main() {
            vec3 rayDir = normalize(vDirection);

            // your box is from -10..10 in each axis in world, but in object space you can
            // normalize to -1..1 or 0..1. Suppose box is -1..1:
            vec3 boxMin = vec3(-1.0);
            vec3 boxMax = vec3( 1.0);

            vec2 bounds = intersectBox(vOrigin, rayDir, boxMin, boxMax);
            if (bounds.x > bounds.y) discard;

            float t = max(bounds.x, 0.0);
            float tEnd = bounds.y;

            float accum = 0.0;
            const int STEPS = 256;
            float dt = (tEnd - t) / float(STEPS);

            for (int i = 0; i < STEPS; i++) {
                vec3 pos = vOrigin + rayDir * (t + float(i) * dt);
                // map from [-1,1] to [0,1]
                vec3 texPos = pos * 0.5 + 0.5;
                float val = texture(volumeTex, texPos).r;
                accum += val * 0.02;
            }

            gl_FragColor = vec4(accum, accum, accum, 1.0);
        }
    `,

    side: THREE.BackSide,
    transparent: true
});

export default material;
