import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  uniform float time;

  void main() {
    vUv = uv;
    vec3 new_position = position;
    new_position.x += sin( time + position.y ) * 5.0;
    new_position.y += cos( time + position.x ) * 5.0;
    new_position.z += sin( time + position.x ) * 5.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(new_position, 1);
  }`;
const fragmentShader = `
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(0.,vUv, 1.0);
  }`;

class Sketch {
  constructor(options) {
    this.container = options.domElement;
    this.scene = new THREE.Scene();
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.container,
      alpha: true,
      antialias: true,
    });
    this.renderer.setClearColor(0x222222, 1);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    this.time = 0;

    this.addObjects();
    this.setupResize();
    this.render();
  }

  setupResize() {
    window.addEventListener('resize', this.resize.bind(this));
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;

    this.camera.updateProjectionMatrix();
  }

  addObjects() {
    this.uniforms = {
      time: { value: 0 },
      position: { value: 0 },
    };
    this.geometry = new THREE.PlaneGeometry(1024, 1024, 32, 32);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      wireframe: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.mesh.position.set(0, -100, 0);
    this.mesh.rotation.set(-Math.PI / 3, 0, 0);
  }

  render() {
    this.time += 0.025;

    this.material.uniforms.time.value = this.time;

    this.renderer.render(this.scene, this.camera);
    window.requestAnimationFrame(this.render.bind(this));
  }
}

new Sketch({
  domElement: document.getElementById('webgl'),
});
