import * as THREE from 'three';

const vertexShader = `
  varying float x;
  varying float y;
  varying float z;
  varying vec3 vUv;

  uniform float time;
  uniform float[64] u_data_arr;

  void main() {
    vUv = position;

    x = abs(position.x);
    y = abs(position.y);

    float floor_x = round(x);
    float floor_y = round(y);

    float x_multiplier = (32.0 - x) / 8.0;
    float y_multiplier = (32.0 - y) / 8.0;

    z = sin(u_data_arr[int(floor_x)] / 50.0 + u_data_arr[int(floor_y)] / 50.0) * 3.;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, position.y, z, 1.0);
  }`;

const fragmentShader = `
  varying float x;
  varying float y;
  varying float z;
  varying vec3 vUv;

  uniform float time;

  void main() {
    gl_FragColor = vec4((32.0 - abs(x)) / 32.0, (32.0 - abs(y)) / 32.0, (abs(x + y) / 2.0) / 32.0, 1.0);
  }`;

class Sketch {
  onMouseMove = (event) => {
    this.mouseX = event.clientX - this.windowHalfX;
    this.mouseY = event.clientY - this.windowHalfY;
  };

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  constructor(options) {
    // Nodes
    this.canvas = options.canvas;
    this.input = options.input;
    this.player = options.player;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Mouse
    this.target = new THREE.Vector3();
    this.mouseX = 0;
    this.mouseY = 0;
    this.windowHalfX = this.width / 2;
    this.windowHalfY = this.height / 2;

    // Scene
    this.scene = new THREE.Scene();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setClearColor(0x222222, 1);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.width / this.height,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    // Timer
    this.time = 0;

    // Initializing
    this.setupMouseEvents();
    this.setupResize();
    this.setupAudio();
    this.addObjects();
    this.render();
  }

  setupMouseEvents() {
    window.addEventListener('mousemove', this.onMouseMove);
  }

  setupResize() {
    window.addEventListener('resize', this.onResize.bind(this));
  }

  setupAudio() {
    this.listener = new THREE.AudioListener();
    this.audio = new THREE.Audio(this.listener);

    this.input.addEventListener(
      'change',
      () => {
        this.player.src = URL.createObjectURL(this.input.files[0]);
        this.player.load();
        this.player.play();
        this.setupAudioContext();
      },
      false
    );
  }

  setupAudioContext() {
    this.context = new AudioContext();
    this.src = this.context.createMediaElementSource(this.player);
    this.analyser = this.context.createAnalyser();
    this.src.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.analyser.fftSize = 1024;
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);
    console.log(this.bufferLength, this.dataArray);
    // this.material.uniforms.u_data_arr.value = this.dataArray;
  }

  addObjects() {
    this.geometry = new THREE.PlaneGeometry(64, 64, 64, 64);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        position: { value: 0 },
        u_data_arr: { type: 'float[64]', value: undefined },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      wireframe: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.mesh.scale.x = 2;
    this.mesh.scale.y = 2;
    this.mesh.scale.z = 2;
    this.mesh.position.y = -8;
    this.mesh.rotation.set(-Math.PI / 3, 0, 0);
  }

  render() {
    this.time += 0.02;
    this.material.uniforms.time.value = this.time;

    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      // this.material.uniforms.u_data_arr.value.needsUpdate = true;
      this.material.uniforms.u_data_arr.value = this.dataArray;
    } else {
      this.material.uniforms.u_data_arr.value = new Uint8Array();
    }

    // Move camera on mousemove
    this.target.x = (1 - this.mouseX) * 0.0005;
    this.target.y = (1 - this.mouseY) * 0.0005;
    this.camera.rotation.x += 0.05 * (this.target.y - this.camera.rotation.x);
    this.camera.rotation.y += 0.05 * (this.target.x - this.camera.rotation.y);

    this.renderer.render(this.scene, this.camera);
    window.requestAnimationFrame(this.render.bind(this));
  }
}

new Sketch({
  canvas: document.getElementById('webgl'),
  input: document.getElementById('input'),
  player: document.getElementById('player'),
});
