import * as THREE from 'three';
import {RenderPass} from 'three/addons/postprocessing/RenderPass';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass';
import {RGBShiftShader} from "three/addons/shaders/RGBShiftShader";
import {ShaderPass} from "three/addons/postprocessing/ShaderPass";

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
    this.hrefFix = "https://cdn.jsdelivr.net/gh/yevheniizh/js-xzzw8t@progress-bar/sample_enhanced_speech.mp3";
    this.hrefRaw = "https://cdn.jsdelivr.net/gh/yevheniizh/js-xzzw8t@progress-bar/sample_unenhanced_speech.mp3";

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
    this.fftSize = 512;

    // Initializing
    this.setupMouseEvents();
    this.setupResize();
    this.setupPlayer();
    this.addObjects();
    this.render();
  }

  setupPlayer() {
    this.tracksReady = 0;
    this.trackRaw = this.prepareTrack( this.hrefRaw );
    this.trackFix = this.prepareTrack( this.hrefFix );
  }

  prepareTrack(href) {
    const listener = new THREE.AudioListener();
    const audio = new THREE.Audio( listener );
    this.context = audio.context;
    const mediaElement = new Audio( href );
    mediaElement.crossOrigin = "anonymous";
    mediaElement.loop = true;
    mediaElement.onloadeddata = () => {
      this.tracksReady = this.tracksReady + 1;
      // Enable togglers on tracks load
      if( this.tracksReady === 2 ) {
        this.onAllTracksLoad();
      };
    };

    audio.setMediaElementSource( mediaElement );
    const analizer = new THREE.AudioAnalyser( audio, this.fftSize );
    return ({ audio, analizer, mediaElement });
  }

  onAllTracksLoad() {
    // Enable togglers on tracks load
    this.playPauseToggler.disabled = false;
    this.audioEnhancerToggler.disabled = false;
    this.audioProgressBar.disabled = false;

    this.activeTrack = this.trackRaw;
    this.inactiveTrack = this.trackFix;
    this.inactiveTrack.mediaElement.volume = 0;

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

      this.activeTrack.mediaElement.volume = 0.5;
      this.inactiveTrack.mediaElement.volume = 0;
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
        uWavesElevation: { value: 0.3 },
        uWavesSpeed: { value: 0.4 },
        uDepthColor: { value: new THREE.Color( 'grey' ) },
        uSurfaceColor: { value: new THREE.Color( 'white' ) },
    },
      vertexShader: window.vertexShader,
      fragmentShader: window.fragmentShader,
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
  }
}

new Sketch();