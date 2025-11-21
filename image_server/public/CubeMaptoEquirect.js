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

    constructor(renderer, cubeCamera, renderTarget) {
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

        this.camera = new THREE.OrthographicCamera( -0.5, 0.5, 0.5, -0.5, 0, 1 );
        this.cubeCamera = cubeCamera;
        this.cubeCamera.renderTarget = renderTarget;

        this.setSize(1920, 1080);
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
    }

  

    convert(cubeCamera) {
        this.quad.material.uniforms.map.value = cubeCamera.renderTarget.texture;
        this.renderer.render(this.scene, this.camera);
    }

    update(camera, scene) {
        this.cubeCamera.position.copy(camera.position);
        this.cubeCamera.quaternion.copy(camera.quaternion);
        this.cubeCamera.update(this.renderer, scene);
        this.convert(this.cubeCamera);
    }
}
