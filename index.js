import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  uniform float time;
  varying vec3 vPosition;

  void main() {
    vPosition = position;

    float sin1 = sin((position.x + position.y) * 0.2 + time * 0.5);
    float sin2 = sin((position.x - position.y) * 0.4 + time * 2.0);
    float sin3 = sin((position.x + position.y) * -0.6 + time);
    vec3 updatePosition = vec3(position.x, position.y, position.z + sin1 * 50.0 + sin2 * 10.0 + sin3 * 8.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(updatePosition, 1.0);
  }`;

const fragmentShader = `
  varying vec3 vPosition;
  uniform float time;

  const float duration = 8.0;
  const float delay = 2.0;

  vec3 convertHsvToRgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float now = clamp((time - delay) / duration, 0.0, 1.0);
    float opacity = (1.0 - length(vPosition.xy / vec2(512.0))) * now;
    vec3 v = normalize(vPosition);
    vec3 rgb = convertHsvToRgb(vec3(0.5 + (v.x + v.y + v.x) / 40.0 + time * 0.1, 0.4, 1.0));
    gl_FragColor = vec4(rgb, opacity);
  }`;

class Sketch {
  onMouseMove = (event) => {
    this.mouseX = event.clientX - this.windowHalfX;
    this.mouseY = event.clientY - this.windowHalfY;
  };

  constructor(options) {
    this.container = options.canvas;
    this.input = options.input;
    this.button = options.button;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.scene = new THREE.Scene();
    this.target = new THREE.Vector3();
    this.mouseX = 0;
    this.mouseY = 0;
    this.windowHalfX = this.width / 2;
    this.windowHalfY = this.height / 2;

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

    this.setupMouseEvents();
    this.setupAudio();
    this.addObjects();
    this.setupResize();
    this.render();
  }

  setupMouseEvents() {
    window.addEventListener('mousemove', this.onMouseMove);
  }

  setupAudio() {
    this.listener = new THREE.AudioListener();
    this.audio = new THREE.Audio(this.listener);

    this.input.addEventListener(
      'change',
      (event) => {
        const files = event.target.files;
        const reader = new FileReader();

        reader.onload = (file) => {
          const arrayBuffer = file.target.result;

          this.listener.context.decodeAudioData(arrayBuffer, (audioBuffer) => {
            this.audio.setBuffer(audioBuffer);
          });
        };

        reader.readAsArrayBuffer(files[0]);
      },
      false
    );

    this.button.addEventListener('click', () => this.audio.play(), false);

    // // create an AudioListener and add it to the camera
    // this.listener = new THREE.AudioListener();
    // this.camera.add(this.listener);

    // // create a global audio source
    // this.sound = new THREE.Audio(this.listener);

    // // load a sound and set it as the Audio object's buffer
    // this.audioLoader = new THREE.AudioLoader();
    // this.audioLoader.load('sounds/ambient.ogg', function (buffer) {
    //   this.sound.setBuffer(buffer);
    //   this.sound.setLoop(true);
    //   this.sound.setVolume(0.5);
    //   this.sound.play();
    // });

    // // create an AudioAnalyser, passing in the sound and desired fftSize
    // this.analyser = new THREE.AudioAnalyser(this.sound, 32);

    // // get the average frequency of the sound
    // const data = this.analyser.getAverageFrequency();
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

    this.mesh.position.set(0, -175, 0);
    this.mesh.rotation.set(-Math.PI / 3, 0, 0);
  }

  render() {
    this.time += 0.02;
    this.material.uniforms.time.value = this.time;

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
  button: document.getElementById('button'),
});
