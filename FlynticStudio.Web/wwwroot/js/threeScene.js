import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class ThreeScene {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.container.innerHTML = "";

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(20, 15, 20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        this.renderer.domElement.style.width = "100%";
        this.renderer.domElement.style.height = "100%";
        this.renderer.domElement.style.position = "absolute";
        this.renderer.domElement.style.top = "0";
        this.renderer.domElement.style.left = "0";
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.setupLights();
        this.setupGrid();
        this.setupPostProcessing();

        window.addEventListener('resize', this.onWindowResize.bind(this));

        this.componentsGroup = new THREE.Group();
        this.scene.add(this.componentsGroup);

        this.wiresGroup = new THREE.Group();
        this.scene.add(this.wiresGroup);

        this.meshes = {};
        this.clock = new THREE.Clock();
        this.isTidy = false;
        this.isPlaying = false;
        this.simulationData = null;
        this.ghostMesh = null; // For snapping preview
        this.snapRings = []; // For pulsing snap hints
        this.onWindowResize();
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Professional Bloom for that "studio" glow
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
            0.4, // Strength
            0.4, // Radius
            0.85 // Threshold
        );
        this.composer.addPass(bloomPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    setupLights() {
        // High-quality studio lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Hemisphere light simulates sky/ground bounce, vital for PBR without environment maps!
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        // Main key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(15, 30, 20);
        keyLight.castShadow = true;
        keyLight.shadow.bias = -0.0001;
        keyLight.shadow.mapSize.width = 4096;
        keyLight.shadow.mapSize.height = 4096;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 100;
        keyLight.shadow.camera.left = -25;
        keyLight.shadow.camera.right = 25;
        keyLight.shadow.camera.top = 25;
        keyLight.shadow.camera.bottom = -25;
        this.scene.add(keyLight);

        // Fill light
        const fillLight = new THREE.PointLight(0xabcfff, 0.4);
        fillLight.position.set(-15, 10, -10);
        this.scene.add(fillLight);

        // Rim light
        const rimLight = new THREE.SpotLight(0xffffff, 0.8);
        rimLight.position.set(0, 40, -20);
        rimLight.angle = Math.PI / 6;
        rimLight.penumbra = 0.5;
        rimLight.target.position.set(0, 0, 0);
        this.scene.add(rimLight);
    }

    setupGrid() {
        // Professional darkened grid
        const gridHelper = new THREE.GridHelper(40, 40, 0x555566, 0x333344);
        gridHelper.position.y = 0.001;
        this.scene.add(gridHelper);

        // High-quality floor (dark brushed metal look)
        const planeGeometry = new THREE.PlaneGeometry(100, 100);
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0x14141a,
            roughness: 0.15,
            metalness: 0.8,
            envMapIntensity: 0.5
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        this.scene.add(plane);
        this.floor = plane;

        // Subtle gradient background
        this.scene.background = new THREE.Color(0x0a0a0f);
        this.scene.fog = new THREE.Fog(0x0a0a0f, 20, 80);
    }

    // Define connection ports for components
    static PORTS = {
        'Frame': [
            { name: 'center', pos: new THREE.Vector3(0, 0.6, 0), isSlot: true, allowed: ['Flight Controller', 'Battery', 'Receiver', 'ESC'] },
            { name: 'front_left', pos: new THREE.Vector3(1, 0.75, 1), isSlot: true, allowed: ['Motor'] },
            { name: 'front_right', pos: new THREE.Vector3(1, 0.75, -1), isSlot: true, allowed: ['Motor'] },
            { name: 'back_left', pos: new THREE.Vector3(-1, 0.75, 1), isSlot: true, allowed: ['Motor'] },
            { name: 'back_right', pos: new THREE.Vector3(-1, 0.75, -1), isSlot: true, allowed: ['Motor'] }
        ],
        'Motor': [
            { name: 'wires', pos: new THREE.Vector3(0, -0.2, 0) },
            { name: 'prop_mount', pos: new THREE.Vector3(0, 0.5, 0), isSlot: true, allowed: ['Propeller'] }
        ],
        'Battery': [
            { name: 'positive', pos: new THREE.Vector3(0.2, 0.1, 2.0) },
            { name: 'negative', pos: new THREE.Vector3(-0.2, 0.1, 2.0) }
        ],
        'Propeller': [
            { name: 'mount', pos: new THREE.Vector3(0, 0, 0) }
        ],
        'Flight Controller': [
            { name: 'power', pos: new THREE.Vector3(0.4, 0.05, 0.4) },
            { name: 'esc1', pos: new THREE.Vector3(0.4, 0.05, -0.4) },
            { name: 'esc2', pos: new THREE.Vector3(-0.4, 0.05, 0.4) },
            { name: 'esc3', pos: new THREE.Vector3(-0.4, 0.05, -0.4) }
        ],
        'ESC': [
            { name: 'power_in', pos: new THREE.Vector3(0, 0, 0.6) },
            { name: 'motor_out', pos: new THREE.Vector3(0, 0, -0.6) }
        ],
        'GPS': [
            { name: 'data', pos: new THREE.Vector3(0, 0.05, 0) }
        ],
        'Camera': [
            { name: 'v_out', pos: new THREE.Vector3(0, 0, -0.2) }
        ]
    };

    createDroneFrame(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'Frame', ports: ThreeScene.PORTS['Frame'] };

        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.6,
            metalness: 0.3,
            flatShading: false
        });

        // Main chassis
        const topPlate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 5.0), frameMat);
        topPlate.position.y = 1.0;
        topPlate.castShadow = true;
        topPlate.receiveShadow = true;
        group.add(topPlate);

        // Status LEDs (Emissive)
        const ledMatRed = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff0000, emissiveIntensity: 2 });
        const ledMatGreen = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x00ff00, emissiveIntensity: 2 });

        const led1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12), ledMatRed);
        led1.position.set(0.8, 1.05, 2.0);
        group.add(led1);

        const led2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12), ledMatGreen);
        led2.position.set(-0.8, 1.05, 2.0);
        group.add(led2);

        const bottomPlate = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 4.5), frameMat);
        bottomPlate.position.y = 0.5;
        bottomPlate.castShadow = true;
        bottomPlate.receiveShadow = true;
        group.add(bottomPlate);

        // Arms (Carbon Fiber texture simulated)
        const armMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5, metalness: 0.3 });
        const angles = [Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];
        angles.forEach(angle => {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.4), armMat);
            arm.rotation.y = angle;
            arm.position.x = Math.cos(angle) * 2;
            arm.position.z = -Math.sin(angle) * 2;
            arm.position.y = 0.75;
            arm.castShadow = true;
            group.add(arm);

            const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16), armMat);
            mount.position.set(Math.cos(angle) * 4, 0.85, -Math.sin(angle) * 4);
            group.add(mount);
        });

        // Landing Skid
        const skidMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, roughness: 0.6 });
        [[-1, 1], [1, 1]].forEach(([xSide, zSide]) => {
            const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), skidMat);
            runner.rotation.x = Math.PI / 2;
            runner.position.set(xSide * 1.5, -0.6, 0);
            group.add(runner);

            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8), skidMat);
            leg.position.set(xSide * 1.2, -0.1, 0);
            leg.rotation.z = xSide * 0.3;
            group.add(leg);
        });

        group.position.y = 0.7;
        return group;
    }

    createMotor(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'Motor', ports: ThreeScene.PORTS['Motor'] };

        const casingMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.5 });
        const windingMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.4, roughness: 0.6 }); // Copper

        // Base
        const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 32), casingMat);
        stator.castShadow = true;
        group.add(stator);

        // Windings (visible through gap)
        const windings = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.4, 16), windingMat);
        group.add(windings);

        // Top rotor
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 32), casingMat);
        rotor.position.y = 0.25;
        group.add(rotor);

        // Motor Hub (Shaft)
        const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16), casingMat);
        propHub.position.y = 0.5;
        group.add(propHub);

        return group;
    }

    createPropeller(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'Propeller', ports: ThreeScene.PORTS['Propeller'] };

        const material = new THREE.MeshStandardMaterial({
            color: 0x222222,
            transparent: true,
            opacity: 0.85,
            metalness: 0.2,
            roughness: 0.6
        });

        const bladeGeom = new THREE.BoxGeometry(4.5, 0.05, 0.3);
        const blade = new THREE.Mesh(bladeGeom, material);
        blade.name = "propeller";
        group.add(blade);

        // Hub center
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16), material);
        group.add(hub);

        return group;
    }

    createBattery(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'Battery', ports: ThreeScene.PORTS['Battery'] };

        const cellMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.1 });
        const wrapperMat = new THREE.MeshStandardMaterial({ color: 0xcccc00, metalness: 0.2, roughness: 0.6 });

        // Main bulk
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 3.5), cellMat);
        body.castShadow = true;
        group.add(body);

        // Label/Heatshrink
        const wrap = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.8, 2.5), wrapperMat);
        group.add(wrap);

        // Lead wires (XT60)
        const posWire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        posWire.rotation.x = Math.PI / 2;
        posWire.position.set(0.2, 0.1, 2.0);
        group.add(posWire);

        const negWire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        negWire.rotation.x = Math.PI / 2;
        negWire.position.set(-0.2, 0.1, 2.0);
        group.add(negWire);

        const connector = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), wrapperMat);
        connector.position.z = 2.5;
        connector.position.y = 0.1;
        group.add(connector);

        return group;
    }

    createFlightController(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'Flight Controller', ports: ThreeScene.PORTS['Flight Controller'] };

        const pcbMat = new THREE.MeshStandardMaterial({ color: 0x005500, roughness: 0.6, metalness: 0.2 });
        const chipMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

        const pcb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.5), pcbMat);
        pcb.castShadow = true;
        group.add(pcb);

        const mcu = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.6), chipMat);
        mcu.position.y = 0.1;
        group.add(mcu);

        // Pins/Heads
        const pinGeom = new THREE.BoxGeometry(0.05, 0.3, 0.05);
        const pinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0 });
        for (let i = 0; i < 4; i++) {
            const pin = new THREE.Mesh(pinGeom, pinMat);
            pin.position.set(0.6 * (i % 2 ? 1 : -1), 0.15, 0.6 * (i < 2 ? 1 : -1));
            group.add(pin);
        }

        return group;
    }

    createESC(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'ESC', ports: ThreeScene.PORTS['ESC'] };

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x000088, metalness: 0.4, roughness: 0.3 });
        const heatsinkMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 1.0 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.8), bodyMat);
        body.castShadow = true;
        group.add(body);

        const sink = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 1.5), heatsinkMat);
        sink.position.y = 0.16;
        group.add(sink);

        return group;
    }

    createGPS(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'GPS', ports: ThreeScene.PORTS['GPS'] };

        const mastMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 1.0 });
        const puckMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1 });

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8), mastMat);
        mast.position.y = 0.75;
        group.add(mast);

        const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 32), puckMat);
        puck.position.y = 1.6;
        group.add(puck);

        return group;
    }

    createCamera(id) {
        const group = new THREE.Group();
        group.name = id;
        group.userData = { id, type: 'Camera', ports: ThreeScene.PORTS['Camera'] };

        const caseMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.2 });
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), caseMat);
        body.castShadow = true;
        group.add(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 16), caseMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.4;
        group.add(barrel);

        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16), lensMat);
        glass.rotation.x = Math.PI / 2;
        glass.position.z = 0.6;
        group.add(glass);

        return group;
    }

    addComponent(componentData) {
        let mesh;
        switch (componentData.type) {
            case 'Frame': mesh = this.createDroneFrame(componentData.instanceId); break;
            case 'Motor': mesh = this.createMotor(componentData.instanceId); break;
            case 'Battery': mesh = this.createBattery(componentData.instanceId); break;
            case 'Flight Controller': mesh = this.createFlightController(componentData.instanceId); break;
            case 'ESC': mesh = this.createESC(componentData.instanceId); break;
            case 'GPS': mesh = this.createGPS(componentData.instanceId); break;
            case 'Camera': mesh = this.createCamera(componentData.instanceId); break;
            case 'Propeller': mesh = this.createPropeller(componentData.instanceId); break;
            default:
                const geom = new THREE.BoxGeometry(1, 1, 1);
                const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
                mesh = new THREE.Mesh(geom, mat);
                mesh.name = componentData.instanceId;
                mesh.userData = { id: componentData.instanceId, type: componentData.type };
                mesh.position.y = 0.5;
                break;
        }

        mesh.position.set(componentData.x || 0, componentData.y || mesh.position.y, componentData.z || 0);
        mesh.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });

        this.componentsGroup.add(mesh);
        this.meshes[componentData.instanceId] = mesh;
        return mesh;
    }

    removeComponent(instanceId) {
        const mesh = this.meshes[instanceId];
        if (mesh) {
            this.componentsGroup.remove(mesh);
            delete this.meshes[instanceId];
            const toRemove = [];
            this.wiresGroup.children.forEach(wire => {
                if (wire.userData.fromId === instanceId || wire.userData.toId === instanceId) toRemove.push(wire);
            });
            toRemove.forEach(w => this.wiresGroup.remove(w));
        }
    }

    addWire(fromId, toId, color = 0x222222) {
        this.removeWire(fromId, toId);

        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.2,
            metalness: 0.1
        });

        const geometry = new THREE.BufferGeometry();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { fromId, toId, isWire: true };
        mesh.castShadow = true;

        this.wiresGroup.add(mesh);
        this.updateWires();
        return mesh;
    }

    removeWire(fromId, toId) {
        const toRemove = [];
        this.wiresGroup.children.forEach(wire => {
            if ((wire.userData.fromId === fromId && wire.userData.toId === toId) ||
                (wire.userData.fromId === toId && wire.userData.toId === fromId)) {
                toRemove.push(wire);
            }
        });
        toRemove.forEach(w => {
            if (w.geometry) w.geometry.dispose();
            this.wiresGroup.remove(w);
        });
    }

    updateWires() {
        this.wiresGroup.children.forEach(wire => {
            const fromMesh = this.meshes[wire.userData.fromId];
            const toMesh = this.meshes[wire.userData.toId];
            if (fromMesh && toMesh) {
                // Find closest ports between the two meshes
                let bestFrom = new THREE.Vector3();
                let bestTo = new THREE.Vector3();
                let minDist = Infinity;

                const fromPorts = fromMesh.userData.ports || [{ pos: new THREE.Vector3() }];
                const toPorts = toMesh.userData.ports || [{ pos: new THREE.Vector3() }];

                fromPorts.forEach(fp => {
                    const fpW = fp.pos.clone().applyMatrix4(fromMesh.matrixWorld);
                    toPorts.forEach(tp => {
                        const tpW = tp.pos.clone().applyMatrix4(toMesh.matrixWorld);
                        const d = fpW.distanceTo(tpW);
                        if (d < minDist) {
                            minDist = d;
                            bestFrom = fpW;
                            bestTo = tpW;
                        }
                    });
                });

                const start = bestFrom;
                const end = bestTo;

                const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                const dist = start.distanceTo(end);

                // Better wire physics simulation
                const sagAmount = this.isTidy ? 0.02 : Math.max(0.1, dist * 0.2);
                mid.y -= sagAmount;

                // Add simple collision avoidance for the frame
                if (mid.y < 1.0 && (Math.abs(mid.x) < 1.5 && Math.abs(mid.z) < 3.0)) {
                    mid.y = 1.3;
                }

                // Add curve points for smoother wire
                const curve = new THREE.CatmullRomCurve3([
                    start,
                    new THREE.Vector3().lerpVectors(start, mid, 0.5),
                    mid,
                    new THREE.Vector3().lerpVectors(mid, end, 0.5),
                    end
                ]);

                const tubeGeom = new THREE.TubeGeometry(curve, 32, 0.04, 8, false);
                if (wire.geometry) wire.geometry.dispose();
                wire.geometry = tubeGeom;
            }
        });
    }

    onWindowResize() {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        if (this.composer) {
            this.composer.setSize(width, height);
        }
    }

    render() {
        this.controls.update();
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        const canFly = this.isPlaying && this.simulationData && this.simulationData.flightCapability !== 'Cannot fly';
        const hasPower = this.isPlaying && this.meshes && Object.values(this.meshes).some(m => m.userData.type === 'Battery');

        if (hasPower) {
            this.componentsGroup.traverse((obj) => {
                if (obj.name === "propeller") {
                    obj.rotation.y += delta * 25;
                }
            });
        }

        if (canFly) {
            const tiltX = (this.simulationData.tiltX || 0) * 0.2;
            const tiltZ = (this.simulationData.tiltZ || 0) * 0.2;

            this.componentsGroup.rotation.x = THREE.MathUtils.lerp(this.componentsGroup.rotation.x, tiltX + Math.sin(time * 2) * 0.02, 0.1);
            this.componentsGroup.rotation.z = THREE.MathUtils.lerp(this.componentsGroup.rotation.z, tiltZ + Math.cos(time * 2) * 0.02, 0.1);
            this.componentsGroup.position.y = THREE.MathUtils.lerp(this.componentsGroup.position.y, 2 + Math.sin(time * 1.5) * 0.2, 0.05);
        } else {
            // When not playing, ensure it's snapped back to assembly state
            // If it was just stopped, we want it to be exact
            if (!this.isPlaying) {
                this.componentsGroup.rotation.x = 0;
                this.componentsGroup.rotation.y = 0;
                this.componentsGroup.rotation.z = 0;
                this.componentsGroup.position.y = 0;
            } else {
                // If paused but can't fly, it stays on ground but might still spin
                this.componentsGroup.rotation.x = THREE.MathUtils.lerp(this.componentsGroup.rotation.x, 0, 0.1);
                this.componentsGroup.rotation.z = THREE.MathUtils.lerp(this.componentsGroup.rotation.z, 0, 0.1);
                this.componentsGroup.position.y = THREE.MathUtils.lerp(this.componentsGroup.position.y, 0, 0.1);
            }
        }

        // Pulse snap hints if active
        if (this.snapRings && this.snapRings.length > 0) {
            const pulseTime = this.clock.getElapsedTime();
            const scale = 1.0 + Math.sin(pulseTime * 10) * 0.15;
            const opacity = 0.5 + Math.sin(pulseTime * 10) * 0.3;
            this.snapRings.forEach(r => {
                r.scale.set(scale, scale, scale);
                if (r.material) r.material.opacity = opacity;
            });
        }

        // IMPORTANT: Update matrix world so wires find the correct port positions after group animation
        this.componentsGroup.updateMatrixWorld(true);
        this.updateWires();

        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    setSimulationData(data) {
        this.simulationData = data;
        if (data && data.isValid && !data.tiltX) {
            let avgX = 0, avgZ = 0, count = 0;
            Object.values(this.meshes).forEach(m => {
                if (m.userData.type === 'Motor') {
                    avgX += m.position.x;
                    avgZ += m.position.z;
                    count++;
                }
            });
            if (count > 0) {
                this.simulationData.tiltX = (avgZ / count) * 0.2;
                this.simulationData.tiltZ = -(avgX / count) * 0.2;
            }
        }
    }

    showSnapPreview(type, pos) {
        if (this.ghostMesh) {
            this.scene.remove(this.ghostMesh);
            this.ghostMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
        }

        // Create a ghost version of the component
        const componentData = { type: type, instanceId: 'ghost' };
        let mesh;
        switch (type) {
            case 'Frame': mesh = this.createFrame('ghost'); break;
            case 'Motor': mesh = this.createMotor('ghost'); break;
            case 'Battery': mesh = this.createBattery('ghost'); break;
            case 'Flight Controller': mesh = this.createFlightController('ghost'); break;
            case 'ESC': mesh = this.createESC('ghost'); break;
            case 'Propeller': mesh = this.createPropeller('ghost'); break;
            default: return;
        }

        // Apply ghost material to all children
        const ghostMat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.4,
            wireframe: false
        });

        mesh.traverse(child => {
            if (child.isMesh) {
                child.material = ghostMat;
            }
        });

        mesh.position.copy(pos);
        this.ghostMesh = mesh;
        this.scene.add(this.ghostMesh);
    }

    hideSnapPreview() {
        if (this.ghostMesh) {
            this.scene.remove(this.ghostMesh);
            this.ghostMesh = null;
        }
    }

    showAvailableSnapPoints(type) {
        this.hideAvailableSnapPoints();
        this.snapRings = [];

        Object.values(this.meshes).forEach(mesh => {
            const ports = mesh.userData.ports;
            if (ports) {
                ports.forEach(port => {
                    // If it is a slot and accepts this component type
                    if (port.isSlot && port.allowed && port.allowed.includes(type)) {
                        // Create glowing torus
                        const ringGeom = new THREE.TorusGeometry(0.3, 0.04, 16, 32);
                        const ringMat = new THREE.MeshBasicMaterial({
                            color: 0x00ffcc,
                            transparent: true,
                            opacity: 0.8,
                            depthTest: false // render on top
                        });
                        const ring = new THREE.Mesh(ringGeom, ringMat);
                        ring.position.copy(port.pos);
                        ring.rotation.x = Math.PI / 2; // Lie flat

                        // Add as child so it moves with the mesh!
                        mesh.add(ring);
                        this.snapRings.push(ring);
                    }
                });
            }
        });
    }

    hideAvailableSnapPoints() {
        if (this.snapRings) {
            this.snapRings.forEach(ring => {
                if (ring.parent) ring.parent.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
            });
        }
        this.snapRings = [];
    }
}
