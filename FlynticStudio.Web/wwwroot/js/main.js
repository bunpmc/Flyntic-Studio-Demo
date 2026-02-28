import { ThreeScene } from './threeScene.js';
import { DragInteraction } from './dragInteraction.js';

// Global state
let threeScene;
let dragInteraction;
let placedComponents = {};

document.addEventListener('DOMContentLoaded', () => {
    // Hide standard 2D canvas overlay
    const gridOverlay = document.getElementById('gridOverlay');
    if (gridOverlay) gridOverlay.style.display = 'none';

    // Initialize Three.js scene
    threeScene = new ThreeScene('assemblyCanvas');
    window.threeScene = threeScene; // Expose for debugging

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        threeScene.render();
    }
    animate();

    // Setup 3D drag interactions
    dragInteraction = new DragInteraction(
        threeScene,
        handleComponentAdded,
        handleComponentMoved,
        handleComponentSelected,
        handleWiringComponentSelected
    );

    // Initial load of existing components from server
    if (window.placedComponents) {
        window.placedComponents.forEach(comp => {
            const meshData = {
                instanceId: comp.instanceId || comp.InstanceId,
                type: comp.type || comp.Type,
                x: comp.x || comp.X || 0,
                y: comp.y || comp.Y || 0,
                z: comp.z || comp.Z || 0
            };

            // Adjust Y for 3D view if it's default 2D grid Y (0)
            if (meshData.y === 0) {
                if (meshData.type === 'Battery') meshData.y = 1.15;
                else if (meshData.type === 'Motor') meshData.y = 0.3;
                else meshData.y = 0.5;
            }

            threeScene.addComponent(meshData);
            placedComponents[meshData.instanceId] = meshData;

            // Sync with Studio for hierarchy consistency
            if (window.Studio && !window.Studio.placedComponents.find(c => (c.instanceId || c.InstanceId) === meshData.instanceId)) {
                window.Studio.placedComponents.push(comp);
            }
        });
        if (window.updateMonitors) window.updateMonitors();
    }

    // Initialize Left Panel Drag and Drop (HTML -> 3D)
    initLeftPanelDraggables();
});

function initLeftPanelDraggables() {
    const items = document.querySelectorAll('.component-item');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            const compData = {
                id: item.dataset.componentId,
                name: item.dataset.componentName,
                type: item.dataset.componentType,
                width: parseInt(item.dataset.componentWidth),
                height: parseInt(item.dataset.componentHeight)
            };

            // Generate a temporary instance ID for drag visualization
            compData.instanceId = 'temp_' + Date.now();

            e.dataTransfer.setData('application/json', JSON.stringify(compData));
            e.dataTransfer.effectAllowed = 'copy';
        });
    });
}

async function handleComponentAdded(data) {
    try {
        // Remove temp ID if any, Backend expects PlaceComponentRequest
        const requestPayload = {
            componentId: data.id,
            x: data.x,
            y: data.y || 0,
            z: data.z
        };

        const response = await axios.post('/api/drone/place', requestPayload);
        const newComp = response.data;

        // Add component to 3D scene
        const componentData = {
            instanceId: newComp.instanceId,
            type: newComp.type,
            x: newComp.x,
            y: newComp.y,
            z: newComp.z
        };

        // If it's a battery or motor, adjust vertical position based on frame
        // But respect the Y value if it was set by snapping or other logic!
        if (componentData.y === undefined || componentData.y === 0) {
            if (componentData.type === 'Battery') {
                componentData.y = 1.15;
            } else if (componentData.type === 'Motor') {
                componentData.y = 0.3;
            } else if (componentData.type === 'Propeller') {
                componentData.y = 1.3;
            } else {
                componentData.y = 0.5; // Frame
            }
        }

        threeScene.addComponent(componentData);
        placedComponents[newComp.instanceId] = newComp;

        // Sync with Studio for hierarchy, monitors and status bar consistency
        if (window.Studio) {
            // Check if it exists (might be there from initial load)
            const exists = window.Studio.placedComponents.some(c => (c.instanceId || c.InstanceId) === newComp.instanceId);
            if (!exists) {
                window.Studio.placedComponents.push(newComp);
            }

            if (window.addToHierarchy) {
                window.addToHierarchy(newComp.instanceId, newComp.name, newComp.type);
            }
            if (window.updateMonitors) window.updateMonitors();
            if (window.updateComponentCount) window.updateComponentCount();
            if (window.updateDiagnostics) window.updateDiagnostics();
        }

    } catch (error) {
        console.error('Error placing component:', error);
        alert('Failed to place component.');
    }
}

async function handleComponentMoved(instanceId, x, y, z) {
    if (!instanceId || instanceId.startsWith('temp_')) return;

    try {
        const payload = {
            instanceId: instanceId,
            x: x, // No rounding, to preserve snap precision!
            y: y,
            z: z,
            rotation: 0,
            isSelected: true
        };

        await axios.put('/api/drone/update', payload);
        placedComponents[instanceId].x = payload.x;
        placedComponents[instanceId].y = payload.y;
        placedComponents[instanceId].z = payload.z;

        // Update wires visualization
        if (threeScene) threeScene.updateWires();
    } catch (error) {
        console.error('Error moving component', error);
    }
}

function handleComponentSelected(instanceId) {
    if (window.Studio) {
        window.Studio.selectedComponent = instanceId;
        window.Studio.selectedComponents = instanceId ? [instanceId] : [];
    }
}

// Override deleteSelected globally so it deletes from ThreeJS as well
const originalDeleteSelected = window.deleteSelected;
window.deleteSelected = async function () {
    const toDelete = window.Studio?.selectedComponents.length > 0
        ? [...window.Studio.selectedComponents]
        : (window.Studio?.selectedComponent ? [window.Studio.selectedComponent] : []);

    if (originalDeleteSelected) {
        await originalDeleteSelected();
    }

    // Also remove from ThreeJS
    if (toDelete && toDelete.length > 0) {
        toDelete.forEach(id => {
            if (window.threeScene) window.threeScene.removeComponent(id);
            if (placedComponents[id]) delete placedComponents[id];

            if (dragInteraction && dragInteraction.transformControls.object?.userData?.id === id) {
                dragInteraction.transformControls.detach();
                dragInteraction.highlightBox.visible = false;
            }
        });
    }
}

// Override deleteFromHierarchy globally
// Removed override of deleteFromHierarchy since drone-studio.js handles it natively now.

// Wiring Mode logic
let firstWiringComponent = null;

window.toggleWiringMode = function () {
    if (!dragInteraction) return;
    dragInteraction.wiringMode = !dragInteraction.wiringMode;
    const btn = document.getElementById('btnWiring');

    if (dragInteraction.wiringMode) {
        btn.classList.replace('btn-outline-info', 'btn-info');
        if (window.log) window.log('info', 'Wiring Mode: Click two components to connect');
        firstWiringComponent = null;
    } else {
        btn.classList.replace('btn-info', 'btn-outline-info');
        if (window.log) window.log('info', 'Wiring Mode disabled');
    }
}

function handleWiringComponentSelected(instanceId) {
    if (!firstWiringComponent) {
        firstWiringComponent = instanceId;
        if (window.log) window.log('info', 'Selected first component. Select another to connect/disconnect.');
    } else {
        if (firstWiringComponent === instanceId) {
            firstWiringComponent = null;
            if (window.log) window.log('info', 'Selection cleared');
            return;
        }

        // Check if wire already exists
        const wireExists = threeScene.wiresGroup.children.some(w =>
            (w.userData.fromId === firstWiringComponent && w.userData.toId === instanceId) ||
            (w.userData.fromId === instanceId && w.userData.toId === firstWiringComponent)
        );

        if (wireExists) {
            threeScene.removeWire(firstWiringComponent, instanceId);
            if (window.Studio) {
                window.Studio.wires = window.Studio.wires.filter(w =>
                    !((w.from === firstWiringComponent && w.to === instanceId) ||
                        (w.from === instanceId && w.to === firstWiringComponent))
                );
            }
            if (window.log) window.log('info', 'Wire removed');
        } else {
            // Connect them!
            threeScene.addWire(firstWiringComponent, instanceId);
            if (window.Studio) {
                window.Studio.wires.push({ from: firstWiringComponent, to: instanceId });
            }
            if (window.log) window.log('success', 'Connected components');
        }
        firstWiringComponent = null;
    }
}

window.toggleTidyWires = function () {
    if (!threeScene) return;
    threeScene.isTidy = !threeScene.isTidy;
    if (window.log) window.log('info', threeScene.isTidy ? 'Wires tidied' : 'Wires sagging');
    threeScene.updateWires();
}

// Sync simulation data with 3D physics
const originalUpdateResult = window.updateMonitorsWithResult;
window.updateMonitorsWithResult = function (result) {
    if (originalUpdateResult) originalUpdateResult(result);
    if (threeScene) {
        threeScene.setSimulationData(result);
    }
}

window.toggleWiringMode = toggleWiringMode;

// Override newProject globally
const originalNewProject = window.newProject;
window.newProject = async function () {
    if (originalNewProject) {
        await originalNewProject();
    }

    // Clear 3D scene
    if (window.threeScene) {
        // Clear components
        while (window.threeScene.componentsGroup.children.length > 0) {
            window.threeScene.componentsGroup.remove(window.threeScene.componentsGroup.children[0]);
        }
        // Clear wires
        while (window.threeScene.wiresGroup.children.length > 0) {
            window.threeScene.wiresGroup.remove(window.threeScene.wiresGroup.children[0]);
        }
        window.threeScene.meshes = {};
    }
    if (window.Studio) {
        window.Studio.wires = [];
    }
    placedComponents = {};
}
