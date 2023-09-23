import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying float x;
  varying float y;
  varying float z;

  uniform float time;
  uniform float[64] tAudioData;

  void main() {
    vUv = uv;
    vPosition = position;

    x = abs(position.x);
    y = abs(position.y);

    float floor_x = round(x);
    float floor_y = round(y);

    z = sin(tAudioData[int(floor_x)] / 32.0 + tAudioData[int(floor_y)] / 32.0) * 0.75;

    float sin1 = sin((position.x + position.y) * 0.2 + time * 0.5);
    float sin2 = sin((position.x - position.y) * 0.4 + time * 0.5);
    float sin3 = sin((position.x + position.y) * -0.6 + time);
    vec3 updatePosition = vec3(position.x, position.y, z + sin1 * 0.5 + sin2 * 0.5 + sin3 * 0.1);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(updatePosition, 1.0);
  }`;

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float time;
  const float duration = 8.0;
  const float delay = 1.0;

  uniform bool magicEnabled;

  vec3 convertHsvToRgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float now = clamp((time - delay) / duration, 0.0, 1.0);
    float opacity = (1.0 - length(vPosition.xy / vec2(32.0))) * now;

    vec3 color = vec3(1.,1.,1.);

    if( magicEnabled ) color = vec3(vUv,1.);

    gl_FragColor = vec4(color, opacity);
  }`;

class Sketch {
  onMouseMove = (event) => {
    this.mouseX = event.clientX - this.windowHalfX;
    this.mouseY = event.clientY - this.windowHalfY;
  };

  onResize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  };

  constructor(options) {
    // Elements
    this.canvas = options.canvas;
    this.playerButton = options.playerButton;
    this.strengthButton = options.strengthButton;

    // State
    this.enabled = false;
    this.playing = false;

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
      85,
      this.width / this.height,
      0.1,
      1000
    );

    // Timer
    this.time = 0;

    // Initializing
    this.setupStrengthButtonEvents();
    this.setupMouseEvents();
    this.setupResize();
    this.setupPlayer();
    this.addObjects();
    this.render();
  }

  setupPlayer() {
    const stream =
      'https://cdn.rawgit.com/ellenprobst/web-audio-api-with-Threejs/57582104/lib/TheWarOnDrugs.m4a'; // <- source must be from CDN

    this.audioLoader = new THREE.AudioLoader();
    this.listener = new THREE.AudioListener();
    this.audio = new THREE.Audio(this.listener);
    this.audio.crossOrigin = 'anonymous';
    this.audioLoader.load(stream, (buffer) => {
      this.audio.setBuffer(buffer);

      this.playerButton.disabled = false;
      this.playerButton.addEventListener('click', () => {
        if (this.audio.isPlaying) {
          this.audio.pause();
          this.playerButton.classList.remove('playing');
          this.playerButton.textContent = '▶️'; // for local testing purposes
        } else {
          this.audio.play();
          this.playerButton.classList.add('playing');
          this.playerButton.textContent = '⏸️'; // for local testing purposes
        }
      });
    });

    this.analyser = new THREE.AudioAnalyser(this.audio, 512);
  }

  setupStrengthButtonEvents() {
    this.strengthButton.addEventListener('click', () => {
      this.enabled = !this.enabled;
      this.enabled
        ? this.strengthButton.classList.add('enabled')
        : this.strengthButton.classList.remove('enabled');
    });
  }

  setupMouseEvents() {
    window.addEventListener('mousemove', this.onMouseMove);
  }

  setupResize() {
    window.addEventListener('resize', this.onResize);
  }

  addObjects() {
    this.geometry = new THREE.PlaneGeometry(64, 64, 64, 64);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        position: { value: 0 },
        magicEnabled: { value: 0 },
        tAudioData: { value: new Uint8Array() },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      wireframe: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.mesh.scale.x = 0.5;
    this.mesh.scale.y = 0.25;
    this.mesh.scale.z = 0.2;
    this.mesh.position.y = 2;
    this.mesh.position.z = -10;
    this.mesh.rotation.set(-(Math.PI / 3), 0, 0);
  }

  render() {
    this.time += 0.02;

    this.material.uniforms.time.value = this.time;
    this.material.uniforms.magicEnabled.value = this.enabled;

    if (this.analyser) {
      this.analyser.getFrequencyData();
      this.material.uniforms.tAudioData.value = this.analyser.data;
    }

    // Move camera on mousemove
    this.target.x = (1 - this.mouseX) * 0.0001;
    this.target.y = (1 - this.mouseY) * 0.0001;
    this.camera.rotation.x += 0.025 * (this.target.y - this.camera.rotation.x);
    this.camera.rotation.y += 0.025 * (this.target.x - this.camera.rotation.y);

    this.renderer.render(this.scene, this.camera);
    window.requestAnimationFrame(this.render.bind(this));
  }
}

new Sketch({
  canvas: document.getElementById('webgl'),
  playerButton: document.getElementById('player-button'),
  strengthButton: document.getElementById('strength-button'),
});
