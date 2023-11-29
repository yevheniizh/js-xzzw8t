import * as THREE from 'three';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { RGBShiftShader } from "three/examples/jsm/shaders/RGBShiftShader";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";

const vertexShader = `  
  varying vec2 vUv;
  varying vec3 vPosition;
  varying float x;
  varying float y;
  varying float z;
  uniform float[64] tAudioData;

  uniform float uTime;
  uniform float uWavesElevation;
  uniform float uWavesSpeed;
  varying float vElevation;

  void main() {
    vUv = uv;
    vPosition = position;

    x = abs(position.x);
    y = abs(position.y);

    float floor_x = round(x);
    float floor_y = round(y);

    float intensity = 0.4;
    z = sin(tAudioData[int(floor_x)] / 32.0 + tAudioData[int(floor_y)] / 32.0) * intensity;

    float sin1 = sin((position.x + position.y) * 0.2 + uTime * uWavesSpeed);
    float sin2 = sin((position.x - position.y) * 0.2 + uTime * uWavesSpeed);
    float sin3 = sin((position.x + position.y) * -0.15 + uTime * uWavesSpeed);

    vec3 updatePosition = vec3(position.x, position.y, z);

    vec4 modelPosition = modelMatrix * vec4(updatePosition, 1.0);

    float elevation = sin1 * sin2 * sin3 * uWavesElevation;

    modelPosition.y += elevation;

    gl_Position = projectionMatrix * viewMatrix * modelPosition;
    
    // Varyings
    vElevation = elevation;
  }`;

const fragmentShader = `  
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uStartTime; 
  const float duration = 2.0;
  const float delay = 0.0;
  uniform bool uAudioEnhanced;
  uniform bool uAudioEnhancedInitially;

  uniform vec3 uDepthColor;
  uniform vec3 uSurfaceColor;
  varying float vElevation;

  // note: (sqrt(pow(p.x, 2.0) + pow(p-y, 2.0)) - г);
  float sdfCircle(vec2 p, float r) {
    return length(p) - r;
  }

  void main() {
    // Initial appearing
    float now = clamp((uTime - delay) / duration, 0.1, 1.0);
    float opacity = (1.0 - length(vPosition.xy / vec2(32.0))) * now;

    // Time
    float speed = 0.5;
    float w = clamp((uTime-uStartTime) / speed, 0., 1.);
    w = mix(float(uAudioEnhancedInitially) * 1.0-w, w, float(uAudioEnhanced));

    // Colors
    vec3 defaultColor = mix(uDepthColor, uSurfaceColor, vElevation * 1.75 + 0.75);
    vec3 enhancedColor = vec3(vUv, 1.0);

    // Define the animation speed
    float radius = 16.0 * w;
    float distance = sdfCircle( vPosition.xy, radius );

    // Calculate the gradient based on the distance from the center
    vec3 gradientColor = mix(enhancedColor, defaultColor, step(radius, distance));
  
    // Set the fragment color
    gl_FragColor = vec4(gradientColor, opacity);
  }`;

class Sketch {
  onMouseMove = (event) => {
    this.mouseX = event.clientX - this.width / 2;
    this.mouseY = event.clientY - this.height / 2;
  };

  onResize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );

    this.composer.setSize(this.width, this.height);
    this.composer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
  };

  constructor() {
    // Elements
    this.canvas = document.getElementById('webgl');
    this.playPauseToggler = document.getElementById('play-pause-toggler');
    this.audioEnhancerToggler = document.getElementById('audio-enhancer-toggler');
    this.audioProgressBarContainer = document.getElementById('audio-progress-bar-container');
    this.audioProgressBar = document.createElement("input");
    this.audioProgressBar.setAttribute("type", "range");
    this.audioProgressBar.setAttribute("disable", "true");
    this.audioProgressBar.setAttribute("id", "audio-progress-bar");
    this.audioProgressBar.setAttribute("value", "0");

    this.audioProgressBarContainer.appendChild(this.audioProgressBar);

    // Sizes
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Mouse
    this.target = new THREE.Vector3();
    this.mouseX = 0;
    this.mouseY = 0;

    THREE.ColorManagement.enabled = false;

    // Scene
    this.scene = new THREE.Scene();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize( this.width, this.height ); 
    this.renderer.setPixelRatio( Math.min( 2, window.devicePixelRatio ) );

    // Camera
    this.camera = new THREE.PerspectiveCamera( 85, this.width / this.height, 0.1, 1000 );

    { // POST PROCESSING
      this.composer = new EffectComposer( this.renderer );
      this.composer.setSize( window.innerWidth, window.innerHeight );
      this.composer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );

      this.renderScene = new RenderPass( this.scene, this.camera );
      this.composer.addPass( this.renderScene );

      { // CHROMATIC ABBERATION
        this.rgbShiftPass = new ShaderPass(RGBShiftShader);
        this.rgbShiftPass.uniforms["amount"].value = 0.0001;
        this.composer.addPass( this.rgbShiftPass );
      }

      { // BLUR
        this.bloomPass = new UnrealBloomPass(
          new THREE.Vector2( window.innerWidth, window.innerHeight ),
          0.3, 5, 0,
        );
        this.bloomPass.enabled = false;
        this.composer.addPass( this.bloomPass );
      }
    }

    // Timer
    this.time = 0;

    // Audio
    this.tracks = [];
    this.context = new AudioContext();

    // Initializing
    this.addEventListeners();
    this.setupPlayer();
    this.addObjects();
    this.render();
  }

  addEventListeners() {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('resize', this.onResize);
  }

  setupPlayer() {
    this.prepareTrack( { mediaElement: window.audioElementRaw, type: 'raw' } );
    this.prepareTrack( { mediaElement: window.audioElementFix, type: 'fix' } );
  }

  prepareTrack( { mediaElement, type } ) {
    // Check that the media is minimally ready to play.
    mediaElement.oncanplaythrough = () => {
      mediaElement.loop = true;

      const src = this.context.createMediaElementSource(mediaElement);
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const gain = this.context.createGain();
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      // Volume
      gain.gain.value = 0.07;
  
      analyser.connect(gain);
      gain.connect(this.context.destination);
      
      this.tracks.push({ analyser, gain, mediaElement, type, dataArray });

      // Check if all tracks are loaded
      if ( this.tracks.length === 2 ) {
        this.trackRaw = this.tracks.find( track => track.type === 'raw' );
        this.trackFix = this.tracks.find( track => track.type === 'fix' );
        this.onAllTracksLoad();
      }
    };
  }

  onAllTracksLoad() {
    // Enable togglers on tracks load
    this.playPauseToggler.disabled = false;
    this.audioEnhancerToggler.disabled = false;
    this.audioProgressBar.disabled = false;

    this.activeTrack = this.trackRaw;
    this.inactiveTrack = this.trackFix;
    // Use gain to mute or set volume, ios doesn't support muted property (https://stackoverflow.com/a/17720950)
    this.inactiveTrack.gain.gain.value = 0.0;

    this.playPauseToggler.addEventListener( 'click', () => {
      // Avoid browser autoplay policy https://developer.chrome.com/blog/autoplay/#webaudio
      // Init all the audio contexts on user interaction
      if( this.context.state === 'suspended' ) {
        this.context.resume();
      }

      if ( this.activeTrack.mediaElement?.paused ) {
        this.activeTrack.mediaElement.play();
        this.inactiveTrack.mediaElement.play();
      } else {
        this.activeTrack.mediaElement.pause();
        this.inactiveTrack.mediaElement.pause();
      }
    } );

    this.audioEnhancerToggler.addEventListener( 'click', () => {
      if ( this.audioEnhancerToggler.checked ) {
        this.activeTrack = this.trackFix;
        this.inactiveTrack = this.trackRaw;
        this.rgbShiftPass.uniforms["amount"].value = 0.001;
        this.bloomPass.enabled = true;
        this.material.uniforms.uAudioEnhanced.value = true;
        this.material.uniforms.uAudioEnhancedInitially.value = true;
      } else {
        this.activeTrack = this.trackRaw;
        this.inactiveTrack = this.trackFix;
        this.rgbShiftPass.uniforms["amount"].value = 0.0001;
        this.bloomPass.enabled = false;
        this.material.uniforms.uAudioEnhanced.value = false;
      }

      this.activeTrack.gain.gain.value = 0.07;
      this.inactiveTrack.gain.gain.value = 0.0;
      this.material.uniforms.uStartTime.value = this.time;
    } );

    this.mouseDownOnSlider = false;

    this.trackFix.mediaElement.addEventListener("timeupdate", () => {
      if (!this.mouseDownOnSlider) {
        this.audioProgressBar.value = this.trackFix.mediaElement.currentTime / this.trackFix.mediaElement.duration * 100;
      }
    });
    this.audioProgressBar.addEventListener("change", () => {
      const pct = this.audioProgressBar.value / 100;
      this.trackFix.mediaElement.currentTime = (this.trackFix.mediaElement.duration || 0) * pct;
      this.trackRaw.mediaElement.currentTime = (this.trackFix.mediaElement.duration || 0) * pct;
    });
    this.audioProgressBar.addEventListener("mousedown", () => {
      this.mouseDownOnSlider = true;
    });
    this.audioProgressBar.addEventListener("mouseup", () => {
      this.mouseDownOnSlider = false;
    });
  }

  addObjects() {
    this.geometry = new THREE.PlaneGeometry(64, 64, 64, 64);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStartTime: { value: 0 },
        position: { value: 0 },
        uAudioEnhanced: { value: false },
        uAudioEnhancedInitially: { value: false },
        tAudioData: { value: new Uint8Array() },
        uWavesElevation: { value: 0.3 },
        uWavesSpeed: { value: 0.4 },
        uDepthColor: { value: new THREE.Color( 'grey' ) },
        uSurfaceColor: { value: new THREE.Color( 'white' ) },
    },
      vertexShader,
      fragmentShader,
      transparent: true,
      wireframe: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.mesh.scale.set(0.5, 0.25, 0.5);
    this.mesh.position.set(0, 2, -10);
    this.mesh.rotation.set(-(Math.PI / 3), 0, 0);
  }

  render() {
    this.time += 0.02;
    this.material.uniforms.uTime.value = this.time;

    // Pass audio data to shaders
    if (this.activeTrack && this.activeTrack?.analyser) {
      this.activeTrack.analyser.getByteFrequencyData(this.activeTrack.dataArray);
      this.material.uniforms.tAudioData.value = this.activeTrack.dataArray;
    }

    // Move camera on mousemove
    this.target.x = (1 - this.mouseX) * 0.0001;
    this.target.y = (1 - this.mouseY) * 0.0001;
    this.camera.rotation.x += 0.025 * (this.target.y - this.camera.rotation.x);
    this.camera.rotation.y += 0.025 * (this.target.x - this.camera.rotation.y);

    this.composer.render();
    window.requestAnimationFrame(this.render.bind(this));
  }
}

new Sketch();