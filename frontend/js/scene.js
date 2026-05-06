import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class SceneManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        // Aquí monto la escena y el fondo
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x505050);

        // La cámara para ver todo desde una buena distancia
        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        this.camera.position.set(0, 100, 500);

        // El renderizador que hace que todo se dibuje con sombras y demás
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.localClippingEnabled = true; // necesario para clipping por material
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.container.appendChild(this.renderer.domElement);

        // Pongo el ambiente y las luces
        this.setupEnvironment();
        this.setupLights();

        // El suelo para que las sombras se proyecten ahí
        this.createFloor();

        // Los controles para poder girar y acercarme con el ratón
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 100, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.update();

        // El bucle para que el dibujo se actualice todo el tiempo
        this.time = 0;
        this.animationLoop = this.animationLoop.bind(this);
        this.animationLoop();

        // Si cambio el tamaño de la ventana, ajusto la escena también
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    // Configuro un ambiente de "habitación" para que los reflejos queden bonitos
    setupEnvironment() {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    }

    // Pongo unos focos para que se vea bien el modelo y tenga sombras reales
    setupLights() {
        const spotLight = new THREE.SpotLight(0xffffff, 5);
        spotLight.position.set(100, 300, 100);
        spotLight.angle = Math.PI / 4;
        spotLight.penumbra = 0.5;
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        spotLight.shadow.bias = -0.0001;
        this.scene.add(spotLight);

        // Una luz de relleno azulita muy suave
        const fillLight = new THREE.DirectionalLight(0xddeeff, 1);
        fillLight.position.set(-100, 100, 100);
        this.scene.add(fillLight);
    }

    // El suelo es transparente pero "atrapa" las sombras
    createFloor() {
        const geometry = new THREE.PlaneGeometry(500, 500);
        const material = new THREE.ShadowMaterial({ opacity: 0.3 });
        const plane = new THREE.Mesh(geometry, material);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        this.scene.add(plane);
    }

    onWindowResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    // --- Controles de Cámara y Rotación ---
    toggleRotation() {
        this.controls.autoRotate = !this.controls.autoRotate;
        this.controls.autoRotateSpeed = 2.0;
        return this.controls.autoRotate;
    }

    zoomIn() {
        // Acercar la cámara moviéndonos hacia adelante en su eje local Z
        this.camera.translateZ(-30);
        this.controls.update();
    }

    zoomOut() {
        // Alejar la cámara
        this.camera.translateZ(30);
        this.controls.update();
    }

    resetCamera() {
        // Restaurar posición inicial de la cámara
        this.camera.position.set(0, 100, 500);
        this.controls.target.set(0, 100, 0);
        this.controls.autoRotate = false;
        this.controls.update();
    }

    animationLoop() {
        requestAnimationFrame(this.animationLoop);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    addToScene(object) {
        this.scene.add(object);
    }

    removeFromScene(object) {
        this.scene.remove(object);
    }
}
