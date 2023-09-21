import * as THREE from 'three';

const vertexShader = `
  varying vec3 vUv;
  varying vec3 vPosition;
  varying float x;
  varying float y;
  varying float z;

  uniform float time;
  uniform float[64] tAudioData;

  void main() {
    vUv = position;
    vPosition = position;

    x = abs(position.x);
    y = abs(position.y);

    float floor_x = round(x);
    float floor_y = round(y);

    float x_multiplier = (32.0 - x) / 8.0;
    float y_multiplier = (32.0 - y) / 8.0;

    z = sin(tAudioData[int(floor_x)] / 25.0 + tAudioData[int(floor_y)] / 25.0) * 1.;

    float sin1 = sin((position.x + position.y) * 0.2 + time * 0.5);
    float sin2 = sin((position.x - position.y) * 0.4 + time * 0.5);
    float sin3 = sin((position.x + position.y) * -0.6 + time);
    vec3 updatePosition = vec3(position.x, position.y, z + sin1 * 0.5 + sin2 * 0.5 + sin3 * 0.1);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(updatePosition, 1.0);
  }`;

const fragmentShader = `
  varying vec3 vUv;
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

    if( magicEnabled ) {
      vec3 v = normalize(vPosition);
      vec3 rgb = convertHsvToRgb(vec3(0.5 + (v.x + v.y + v.x) / 40.0 + time * 0.1, 0.4, 1.0));
      color = rgb;
    }

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
    // Nodes
    this.canvasNode = options.canvasNode;
    this.inputNode = options.inputNode;
    this.playerNode = options.playerNode;
    this.checkboxNode = options.checkboxNode;

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
      canvas: this.canvasNode,
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
    this.setupAudioContext();
    this.addObjects();
    this.render();
  }

  setupMouseEvents() {
    window.addEventListener('mousemove', this.onMouseMove);
  }

  setupResize() {
    window.addEventListener('resize', this.onResize.bind(this));
  }

  setupResize() {
    window.addEventListener('resize', this.onResize.bind(this));
  }

  setupAudio() {
    this.inputNode.addEventListener(
      'change',
      () => {
        this.playerNode.src = URL.createObjectURL(this.inputNode.files[0]);
        this.playerNode.load();
        this.playerNode.play();
      },
      false
    );
  }

  setupAudioContext() {
    this.audioContext = new AudioContext();
    this.audioSrc = this.audioContext.createMediaElementSource(this.playerNode);
    this.audioAnalyser = this.audioContext.createAnalyser();
    this.audioSrc.connect(this.audioAnalyser);
    this.audioAnalyser.connect(this.audioContext.destination);
    this.audioAnalyser.fftSize = 1024;
    this.audioBufferLength = this.audioAnalyser.frequencyBinCount;
    this.audioDataArray = new Uint8Array(this.audioBufferLength);
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

    this.mesh.scale.x = 2;
    this.mesh.scale.y = 2;
    this.mesh.scale.z = 2;
    this.mesh.position.y = -8;
    this.mesh.rotation.set(-Math.PI / 3, 0, 0);
  }

  render() {
    this.time += 0.02;

    this.material.uniforms.time.value = this.time;
    this.material.uniforms.magicEnabled.value = this.checkboxNode.checked;

    // Update sounds data
    if (this.audioAnalyser && this.audioDataArray) {
      this.audioAnalyser.getByteFrequencyData(this.audioDataArray);
      this.material.uniforms.tAudioData.value = this.audioDataArray;
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
  canvasNode: document.getElementById('webgl'),
  inputNode: document.getElementById('input'),
  playerNode: document.getElementById('player'),
  checkboxNode: document.getElementById('checkbox'),
});
