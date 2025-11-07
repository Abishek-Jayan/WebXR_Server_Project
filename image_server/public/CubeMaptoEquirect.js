// CubemapToEquirectangular.module.js
import * as THREE from "three";

const vertexShader = `
attribute vec3 position;
attribute vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

varying vec2 vUv;

void main()  {
    vUv = vec2( 1.- uv.x, uv.y );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const fragmentShader = `
precision highp float;

uniform samplerCube map;

varying vec2 vUv;

#define M_PI 3.1415926535897932384626433832795

void main()  {
    vec2 uv = vUv;

    float longitude = uv.x * 2. * M_PI - M_PI + M_PI / 2.;
    float latitude = uv.y * M_PI;

    vec3 dir = normalize(vec3(
        - sin( longitude ) * sin( latitude ),
        cos( latitude ),
        - cos( longitude ) * sin( latitude )
));

    gl_FragColor = textureCube( map, dir );
}
`;

export class CubemapToEquirectangular {

    constructor(renderer, provideCubeCamera) {
        this.width = 1;
        this.height = 1;
        this.renderer = renderer;

        this.material = new THREE.RawShaderMaterial({
            uniforms: { map: { value: null } },
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            transparent: true
        });

        this.scene = new THREE.Scene();
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
        this.scene.add(this.quad);

        this.camera = new THREE.OrthographicCamera( -0.5, 0.5, 0.5, -0.5, -10000, 10000 );

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.cubeCamera = null;
        this.attachedCamera = null;

        this.setSize(4096, 2048);

        const gl = this.renderer.getContext();
        this.cubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);

        if (provideCubeCamera)
        {
            this.cubeCamera = this.getCubeCamera(4096);
        }
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;

        this.quad.scale.set(this.width, this.height, 1);

        this.camera.left = -this.width / 2;
        this.camera.right = this.width / 2;
        this.camera.top = this.height / 2;
        this.camera.bottom = -this.height / 2;
        this.camera.updateProjectionMatrix();

        this.output = new THREE.WebGLRenderTarget(this.width, this.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType
        });

        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    getCubeCamera(size) {
        const cubeMapSize = Math.min(this.cubeMapSize, size);
        const options = { format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
        const renderTarget = new THREE.WebGLCubeRenderTarget(cubeMapSize, options);
        this.cubeCamera = new THREE.CubeCamera(0.1, 1000, renderTarget);
        this.cubeCamera.renderTarget = renderTarget;


        return this.cubeCamera;
    }

    attachCubeCamera(camera) {
        this.cubeCamera = this.getCubeCamera();
        this.cubeCamera.position.copy(camera.position);
        this.attachedCamera = camera;
    }

    convert(cubeCamera, download) {
        this.quad.material.uniforms.map.value = cubeCamera.renderTarget.texture;
        this.renderer.xr.enabled = false;
        this.renderer.setRenderTarget(this.output);
        this.renderer.render(this.scene, this.camera);
        this.renderer.xr.enabled = true;
        this.renderer.setRenderTarget(null);


        const pixels = new Uint8Array(4 * this.width * this.height);
        this.renderer.readRenderTargetPixels(this.output, 0, 0, this.width, this.height, pixels);

        const imageData = new ImageData(new Uint8ClampedArray(pixels), this.width, this.height);

        // if (download !== false) this.download(imageData);

        return imageData;
    }

    download(imageData) {
        this.ctx.putImageData(imageData, 0, 0);
        this.canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const fileName = 'pano-' + document.title + '-' + Date.now() + '.png';
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.setAttribute("download", fileName);
            anchor.style.display = "none";
            document.body.appendChild(anchor);
            setTimeout(() => {
                anchor.click();
                document.body.removeChild(anchor);
            }, 1);
        }, 'image/png');
    }

    update(camera, scene) {
        const autoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        this.cubeCamera.position.copy(camera.position);
        this.cubeCamera.quaternion.copy(camera.quaternion);
        this.cubeCamera.update(this.renderer, scene);
        this.renderer.autoClear = autoClear;
        return this.convert(this.cubeCamera);
    }
}
