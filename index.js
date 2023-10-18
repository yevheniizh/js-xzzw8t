import * as THREE from 'three';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { RGBShiftShader } from "three/examples/jsm/shaders/RGBShiftShader";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";

import './styles.css';

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

    z = sin(tAudioData[int(floor_x)] / 32.0 + tAudioData[int(floor_y)] / 32.0) * 0.75;

    float sin1 = sin((position.x + position.y) * 0.2 + uTime * uWavesSpeed);
    float sin2 = sin((position.x - position.y) * 0.2 + uTime * uWavesSpeed);
    float sin3 = sin((position.x + position.y) * -0.25 + uTime * uWavesSpeed);
    vec3 updatePosition = vec3(position.x, position.y, z);

    vec4 modelPosition = modelMatrix * vec4(updatePosition, 1.0);

    // Elevation
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

  // note: sqrt(pow(p.x, 2.0) + pow(p-y, 2.0)) - г;
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
    w = mix(float(uAudioEnhancedInitially)*1.0-w, w, float(uAudioEnhanced));

    // Colors
    vec3 defaultColor = mix(uDepthColor, uSurfaceColor, vElevation * 2.5 + 0.75);
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
    this.mouseX = event.clientX - this.windowHalfX;
    this.mouseY = event.clientY - this.windowHalfY;
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

  constructor(options) {
    this.trackHrefs = options.trackHrefs;
    this.trackHrefEnhanced = this.trackHrefs.enhanced;
    this.trackHrefUnenhanced = this.trackHrefs.unenhanced;
    this.playCheckbox = document.querySelector('.play-checkbox');
    this.audioToggler = document.querySelector('.audio-enhancer-toggler');

    // Elements
    this.canvas = options.canvas;
    this.playPauseToggler = options.playPauseToggler;
    this.audioEnhancerToggler = options.audioEnhancerToggler;

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
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize( this.width, this.height ); 
    this.renderer.setPixelRatio( Math.min( 2, window.devicePixelRatio ) );

    // Camera
    this.camera = new THREE.PerspectiveCamera( 85, this.width / this.height, 0.1, 1000 );

    { // POST PROCESSING
      // Add the effectComposer
      this.composer = new EffectComposer( this.renderer );
      this.composer.setSize( window.innerWidth, window.innerHeight );
      this.composer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
  
      /**
       * Add the render path to the composer
       * This pass will take care of rendering the final scene
       */
      this.renderScene = new RenderPass( this.scene, this.camera );
      this.composer.addPass( this.renderScene );

      { // CHROMATIC ABBERATION
        /**
         * Add the rgbShift pass to the composer
         * This pass will be responsible for handling the rgbShift effect
         */
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
        this.composer.addPass( this.bloomPass ); // To be deleted?
      }
    }

    // Timer
    this.time = 0;

    // Audio
    this.fftSize = 512; // square of 2

    // Initializing
    this.setupMouseEvents();
    this.setupResize();
    this.setupPlayer();
    this.addObjects();
    this.render()
    // this.capturer = new CCapture( {
    //   format: 'webm',
    //   framerate: 30,
    // } );

    // this.capturer.start();

    // setTimeout(() => {
    //   // default save, will download automatically a file called {name}.extension (webm/gif/tar)
    //   this.capturer.save();
    // }, 5000);
  }

  setupPlayer() {
    this.loadedTracksCount = 0;
    this.trackEnhanced = this.prepareTrack( this.trackHrefEnhanced );
    this.trackUnenhanced = this.prepareTrack( this.trackHrefUnenhanced );
  }

  prepareTrack(href) {
    const loader = new THREE.AudioLoader();
    const listener = new THREE.AudioListener();
    const audio = new THREE.Audio( listener );
    loader.load( href, ( buffer ) => {
      audio.setBuffer( buffer );
      audio.setLoop( true );
      this.loadedTracksCount = this.loadedTracksCount + 1;
      if( this.loadedTracksCount === Object.keys( this.trackHrefs ).length ) this.onAllTracksLoad();
    });
    const analizer = new THREE.AudioAnalyser( audio, this.fftSize );

    return ({ audio, analizer });
  }

  onAllTracksLoad() {
    this.activeTrack = this.trackUnenhanced;
    this.inactiveTrack = this.trackEnhanced;
    this.inactiveTrack.audio.setVolume( 0 );

    // Make togglers clickable on tracks load
    this.playPauseToggler.disabled = false;
    this.audioEnhancerToggler.disabled = false;

    this.playPauseToggler.addEventListener( 'click', () => {
      if ( this.activeTrack.audio.isPlaying ) {
        this.activeTrack.audio.pause();
        this.inactiveTrack.audio.pause();
        this.playCheckbox.classList.remove( 'w--redirected-checked' );
      } else {
        this.activeTrack.audio.play();
        this.inactiveTrack.audio.play();
        this.playCheckbox.classList.add( 'w--redirected-checked' );
      }
    } );

    this.audioEnhancerToggler.addEventListener( 'click', () => {
      if ( this.audioEnhancerToggler.checked ) {
        this.activeTrack = this.trackEnhanced;
        this.inactiveTrack = this.trackUnenhanced;
        this.rgbShiftPass.enabled = false;
        this.bloomPass.enabled = true;
        this.material.uniforms.uAudioEnhanced.value = true;
        this.material.uniforms.uAudioEnhancedInitially.value = true;
        this.audioToggler.classList.add( 'w--redirected-checked' );
        console.log('aaa', this.playCheckbox)
      } else {
        this.activeTrack = this.trackUnenhanced;
        this.inactiveTrack = this.trackEnhanced;
        this.rgbShiftPass.enabled = true;
        this.bloomPass.enabled = false;
        this.material.uniforms.uAudioEnhanced.value = false;
        this.audioToggler.classList.remove( 'w--redirected-checked' );
      }

      this.activeTrack.audio.setVolume( 0.5 );
      this.inactiveTrack.audio.setVolume( 0 );
      this.material.uniforms.uStartTime.value = this.time;
    } );
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
        uTime: { value: 0 },
        uStartTime: { value: 0 },
        position: { value: 0 },
        uAudioEnhanced: { value: false },
        uAudioEnhancedInitially: { value: false },
        tAudioData: { value: new Uint8Array() },
        uWavesElevation: { value: 0.35 },
        uWavesSpeed: { value: 0.25 },
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

    this.mesh.scale.x = 0.5;
    this.mesh.scale.y = 0.25;
    this.mesh.scale.z = 0.2;
    this.mesh.position.y = 2;
    this.mesh.position.z = -10;
    this.mesh.rotation.set(-(Math.PI / 3), 0, 0);
  }

  render() {
    this.time += 0.02;
    this.material.uniforms.uTime.value = this.time;

    // Pass audio data to shaders
    if (this.activeTrack?.analizer) {
      this.activeTrack.analizer.getFrequencyData();
      this.material.uniforms.tAudioData.value = this.activeTrack.analizer.data;
    }

    // Move camera on mousemove
    this.target.x = (1 - this.mouseX) * 0.0001;
    this.target.y = (1 - this.mouseY) * 0.0001;
    this.camera.rotation.x += 0.025 * (this.target.y - this.camera.rotation.x);
    this.camera.rotation.y += 0.025 * (this.target.x - this.camera.rotation.y);

    this.composer.render();
    window.requestAnimationFrame(this.render.bind(this));
    if (this.capturer) this.capturer.capture(this.renderer.domElement);
  }
}

new Sketch({
  /**
   * NOTE: sources must be stored on some CDN!
   * The easiest way to do this is to upload raw audio files to the Github repo
   * and just prepare the link in the following format "https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filepath}"
   * ( "jsdelivr" will take care of the free CDN under-the-hood )
   * */
  trackHrefs: {
    enhanced:   "https://cdn.jsdelivr.net/gh/yevheniizh/js-xzzw8t@dev/sample_enhanced_speech.wav",
    unenhanced: "https://cdn.jsdelivr.net/gh/yevheniizh/js-xzzw8t@dev/sample_unenhanced_speech.wav",
  },
  canvas: document.getElementById('webgl'),
  playPauseToggler: document.getElementById('play-pause-toggler'),
  audioEnhancerToggler: document.getElementById('audio-enhancer-toggler'),
});
