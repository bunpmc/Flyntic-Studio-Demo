import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export class DragInteraction {
    constructor(threeScene, onComponentAdded, onComponentMoved, onComponentSelected, onWiringComponentSelected) {
        this.threeScene = threeScene;
        this.camera = threeScene.camera;
        this.renderer = threeScene.renderer;
        this.scene = threeScene.scene;

        this.onComponentAdded = onComponentAdded;
        this.onComponentMoved = onComponentMoved;
        this.onComponentSelected = onComponentSelected;
        this.onWiringComponentSelected = onWiringComponentSelected;

        this.wiringMode = false;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.intersection = new THREE.Vector3();



        // Highlight material
        this.highlightBox = new THREE.BoxHelper();
        this.highlightBox.material.color.setHex(0x00ffcc);
        this.highlightBox.visible = false;
        this.scene.add(this.highlightBox);

        // Transform Controls for XYZ movement
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.threeScene.controls.enabled = !event.value;
            // When user releases the drag handle, broadcast the new position!
            if (!event.value && this.transformControls.object) {
                const obj = this.transformControls.object;

                // Snap check!
                const snap = this.getSnapPoint(obj.userData.type, obj.position);
                if (snap) {
                    obj.position.copy(snap);
                    this.highlightBox.update();
                }

                if (this.onComponentMoved) {
                    this.onComponentMoved(obj.userData.id, obj.position.x, obj.position.y, obj.position.z);
                }
            }
        });

        // Listen to object change to update highlight box smoothly during dragging
        this.transformControls.addEventListener('change', () => {
            if (this.transformControls.object) {
                const obj = this.transformControls.object;

                // Real-time snapping preview during drag!
                const snap = this.getSnapPoint(obj.userData.type, obj.position);
                if (snap) {
                    // Show ghostly preview where it WILL snap
                    this.threeScene.showSnapPreview(obj.userData.type, snap);
                } else {
                    this.threeScene.hideSnapPreview();
                }

                this.highlightBox.update();
            }
        });

        this.scene.add(this.transformControls);

        this.initEvents();
    }

    initEvents() {
        const dom = this.renderer.domElement;

        // Click to select/deselect
        dom.addEventListener('pointerdown', this.onPointerDown.bind(this));

        // HTML drag and drop into 3D scene
        dom.addEventListener('dragover', this.onDragOver.bind(this));
        dom.addEventListener('dragleave', this.onDragLeave.bind(this));
        dom.addEventListener('drop', this.onDrop.bind(this));
    }

    onDragLeave(event) {
        this.threeScene.hideSnapPreview();
    }

    onPointerDown(event) {
        // If it's a right click or we are clicking exactly on the TransformControls gizmo, do nothing
        if (event.button !== 0 || this.transformControls.dragging) return;

        event.preventDefault();
        this.updateMouse(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.threeScene.componentsGroup.children, true);

        if (intersects.length > 0) {
            // Find root group element
            let object = intersects[0].object;
            while (object.parent && object.parent !== this.threeScene.componentsGroup) {
                object = object.parent;
            }

            if (this.wiringMode) {
                if (this.onWiringComponentSelected) {
                    this.onWiringComponentSelected(object.userData.id);
                }
                return;
            }

            this.transformControls.attach(object);

            // Selection Highlight
            this.highlightBox.setFromObject(object);
            this.highlightBox.visible = true;

            if (this.onComponentSelected) {
                this.onComponentSelected(object.userData.id);
            }
        } else {
            if (this.wiringMode) return;

            this.transformControls.detach();
            this.highlightBox.visible = false;
            if (this.onComponentSelected) {
                this.onComponentSelected(null);
            }
        }
    }

    updateMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    planeRaycast() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (this.raycaster.ray.intersectPlane(this.plane, this.intersection)) {
            return true;
        }
        return false;
    }

    onDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        this.updateMouse(event);

        // Try to show preview during HTML drag
        let dataStr = event.dataTransfer.getData('application/json');
        if (!dataStr && window.draggedComponent) {
            // Some browsers or if internal draggedComponent state is available
            if (this.planeRaycast()) {
                const snap = this.getSnapPoint(window.draggedComponent.type, this.intersection);
                if (snap) {
                    this.threeScene.showSnapPreview(window.draggedComponent.type, snap);
                    return;
                }
            }
        }
        // Fallback for when dataTransfer is restricted or if manually managed
        if (this.planeRaycast()) {
            // We might not know the type from palette drag yet easily without window.draggedComponent
            if (window.draggedComponent) {
                const snap = this.getSnapPoint(window.draggedComponent.type, this.intersection);
                if (snap) {
                    this.threeScene.showSnapPreview(window.draggedComponent.type, snap);
                } else {
                    this.threeScene.hideSnapPreview();
                }
            }
        }
    }

    onDrop(event) {
        event.preventDefault();
        this.updateMouse(event);

        let dataStr = event.dataTransfer.getData('application/json');
        if (!dataStr) {
            dataStr = event.dataTransfer.getData('text/plain');
        }

        if (!dataStr) return;

        try {
            const data = JSON.parse(dataStr);
            if (this.planeRaycast()) {
                let x = this.intersection.x;
                let z = this.intersection.z;
                let y = 0.5;

                // Snap check!
                const snap = this.getSnapPoint(data.type, new THREE.Vector3(x, y, z));
                if (snap) {
                    x = snap.x;
                    y = snap.y;
                    z = snap.z;
                } else {
                    y = 0; // Fallback to main.js defaults
                }

                data.x = x;
                data.z = z;
                data.y = y;

                if (this.onComponentAdded) {
                    this.onComponentAdded(data);
                }
            }
            this.threeScene.hideSnapPreview();
        } catch (e) {
            console.error("Drop Parse error", e);
            this.threeScene.hideSnapPreview();
        }
    }

    getSnapPoint(type, currentPos) {
        const snapDistance = 1.8; // Distance threshold for snapping (reduced for precision)
        let bestSnap = null;
        let minDist = snapDistance;

        // Iterate through all placed components to find available slots
        Object.values(this.threeScene.meshes).forEach(mesh => {
            // Need latest world matrix for port calculation!
            mesh.updateMatrixWorld();
            const ports = mesh.userData.ports;
            if (ports) {
                ports.forEach(port => {
                    // Check if it's a slot and allows this type
                    if (port.isSlot && port.allowed && port.allowed.includes(type)) {
                        // Calculate world position of the port
                        const portWorldPos = port.pos.clone().applyMatrix4(mesh.matrixWorld);
                        const dist = currentPos.distanceTo(portWorldPos);

                        if (dist < minDist) {
                            minDist = dist;
                            bestSnap = portWorldPos.clone();
                        }
                    }
                });
            }
        });

        return bestSnap;
    }
}
