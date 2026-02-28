/**
 * Flyntic Studio - Drone Assembly & Visual Programming
 * Clean and Simple JavaScript
 */

// ===============================================
// State
// ===============================================
const Studio = {
    components: window.initialComponents || [],
    placedComponents: window.placedComponents || [],
    wires: [], // Track wiring connectivity
    selectedComponent: null,
    selectedComponents: [], // Multi-selection
    simulationState: 'stopped', // stopped, playing, paused
    currentTab: 'canvas',
    currentCategory: 'motion',
    droppedBlocks: [],
    selectedBlocks: [], // Multi-selection for blocks
    gridCellSize: 40,
    // Undo/Redo history
    history: [],
    historyIndex: -1,
    maxHistory: 50,
    // Marquee selection
    isMarqueeSelecting: false,
    marqueeStart: { x: 0, y: 0 }
};

// ===============================================
// Initialize
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    // initDragDrop(); // Disabled for 3D
    initBlocksDragDrop();
    initCanvasEvents();
    initKeyboard();
    // renderPlacedComponents(); // Disabled for 3D
    updateComponentCount();
    log('info', 'Flyntic Studio ready');
});

// ===============================================
// Tab Switching
// ===============================================
function switchTab(tabName) {
    Studio.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.workspace-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === 'tab-' + tabName);
    });
}

// ===============================================
// Block Category Selection
// ===============================================
function selectCategory(category) {
    Studio.currentCategory = category;

    // Update category buttons
    document.querySelectorAll('.block-category').forEach(cat => {
        cat.classList.remove('active');
    });
    document.querySelector(`.block-category.${category}`)?.classList.add('active');

    // Show relevant blocks
    const palette = document.getElementById('blockPalette');
    if (!palette) return;

    // Hide all category-specific blocks
    palette.querySelectorAll('.events-blocks, .motion-blocks, .control-blocks, .sensing-blocks, .operators-blocks, .variables-blocks').forEach(el => {
        el.style.display = 'none';
    });

    // Show selected category blocks
    const categoryBlocks = palette.querySelector(`.${category}-blocks`);
    if (categoryBlocks) {
        categoryBlocks.style.display = 'block';
    }
}

// ===============================================
// Console
// ===============================================
function log(type, message) {
    // Guard against undefined/null messages
    if (message === undefined || message === null) return;

    const consoleEl = document.getElementById('consoleContent');
    if (!consoleEl) return;

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.innerHTML = `<span class="time">[${time}]</span><span class="message">${message}</span>`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearConsole() {
    const console = document.getElementById('consoleContent');
    console.innerHTML = '';
    log('info', 'Console cleared');
}

function switchConsoleTab(tab) {
    document.querySelectorAll('.console-tab').forEach(t => {
        t.classList.toggle('active', t.textContent.toLowerCase() === tab);
    });
}

// ===============================================
// Simulation Controls
// ===============================================
function togglePlay() {
    if (Studio.simulationState === 'playing') {
        pauseSimulation();
    } else {
        playSimulation();
    }
}

async function playSimulation() {
    // PRE-FLIGHT CHECK (Logical assembly and wiring)
    const components = Studio.placedComponents;
    const wires = Studio.wires;

    const hasBattery = components.some(c => c.type === 'Battery');
    const motors = components.filter(c => c.type === 'Motor');
    const frames = components.filter(c => c.type === 'Frame');
    const hasFrame = frames.length > 0;

    // Simple Wiring check: Is battery connected to anything?
    const batteryId = components.find(c => c.type === 'Battery')?.instanceId;
    const batteryWired = wires.some(w => w.from === batteryId || w.to === batteryId);

    // Are there propellers on motors? (Check motors without props)
    const unwiredMotors = motors.filter(m => !wires.some(w => w.from === m.instanceId || w.to === m.instanceId));
    const props = components.filter(c => c.type === 'Propeller');

    // Asymmetrical lift calculation for tilt
    let tiltX = 0;
    let tiltZ = 0;
    let flightCapability = 'Stable';

    if (!hasFrame || !hasBattery || !batteryWired || motors.length < 2) {
        flightCapability = 'Cannot fly';
        if (!hasFrame) log('error', 'Pre-flight Check: No Frame detected');
        else if (!hasBattery) log('error', 'Pre-flight Check: No Battery detected');
        else if (!batteryWired) log('error', 'Pre-flight Check: Battery is not wired!');
        else if (motors.length < 2) log('error', 'Pre-flight Check: At least 2 motors required to fly');
    } else {
        // Find which motors have no props (simplified: if count < motors, tilt based on first missing)
        if (unwiredMotors.length > 0) {
            flightCapability = 'Unstable';
            log('warning', `Pre-flight: ${unwiredMotors.length} motors have NO POWER (not wired)`);
            // Dynamic tilt based on motor position
            unwiredMotors.forEach(m => {
                tiltX += (m.gridX > 5 ? -1.0 : 1.0);
                tiltZ += (m.gridY > 5 ? -1.0 : 1.0);
            });
        }

        if (props.length < motors.length) {
            flightCapability = 'Unstable';
            log('warning', `Pre-flight: ${motors.length - props.length} motors are missing propellers!`);
            tiltX += 0.8; // Fixed tilt for now
        }
    }

    // Clamp tilt
    tiltX = Math.max(-1.5, Math.min(1.5, tiltX));
    tiltZ = Math.max(-1.5, Math.min(1.5, tiltZ));

    Studio.simulationState = 'playing';
    updateSimulationUI();

    if (window.threeScene) {
        window.threeScene.isPlaying = true;
        window.threeScene.setSimulationData({
            flightCapability: flightCapability,
            tiltX: tiltX,
            tiltZ: tiltZ,
            isValid: true
        });
    }

    try {
        const response = await fetch('/api/drone/simulation/play', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            // Merge with local connectivity result
            const finalResult = { ...result.calculationResult, flightCapability: flightCapability };
            updateMonitorsWithResult(finalResult);
            log('success', flightCapability === 'Stable' ? 'Simulation started' : 'Simulation running with warnings');
            document.getElementById('canvasStatus').textContent = flightCapability === 'Stable' ? 'Simulating...' : 'Warning: Unstable Assembly';
        }
    } catch (error) {
        log('error', 'Failed to start simulation');
    }
}

async function pauseSimulation() {
    Studio.simulationState = 'paused';
    updateSimulationUI();
    if (window.threeScene) window.threeScene.isPlaying = false;

    await fetch('/api/drone/simulation/pause', { method: 'POST' });
    log('warning', 'Simulation paused');
    document.getElementById('canvasStatus').textContent = 'Paused';
}

async function stopSimulation() {
    Studio.simulationState = 'stopped';
    updateSimulationUI();
    if (window.threeScene) window.threeScene.isPlaying = false;

    await fetch('/api/drone/simulation/stop', { method: 'POST' });
    log('info', 'Simulation stopped');
    document.getElementById('canvasStatus').textContent = 'Ready to simulate';
}

function updateSimulationUI() {
    const playBtn = document.getElementById('btnPlay');
    const playIcon = document.getElementById('playIcon');
    const pauseBtn = document.getElementById('btnPause');
    const stopBtn = document.getElementById('btnStop');

    if (Studio.simulationState === 'playing') {
        playBtn.classList.add('playing');
        playIcon.className = 'bi bi-pause-fill';
        pauseBtn.disabled = false;
    } else {
        playBtn.classList.remove('playing');
        playIcon.className = 'bi bi-play-fill';
        pauseBtn.disabled = true;
    }
}

// ===============================================
// Component Drag & Drop
// ===============================================
window.draggedComponent = null;
let dropIndicator = null;

function initDragDrop() {
    document.querySelectorAll('.component-item').forEach(item => {
        item.addEventListener('dragstart', onComponentDragStart);
        item.addEventListener('dragend', onComponentDragEnd);
    });

    const canvas = document.getElementById('assemblyCanvas');
    if (canvas) {
        canvas.addEventListener('dragover', onCanvasDragOver);
        canvas.addEventListener('dragleave', onCanvasDragLeave);
        canvas.addEventListener('drop', onCanvasDrop);
    }
}

function onComponentDragStart(e) {
    window.draggedComponent = {
        id: e.target.dataset.componentId,
        name: e.target.dataset.componentName,
        type: e.target.dataset.componentType,
        width: parseInt(e.target.dataset.componentWidth) || 1,
        height: parseInt(e.target.dataset.componentHeight) || 1,
        color: e.target.dataset.componentColor,
        icon: e.target.dataset.componentIcon
    };

    e.dataTransfer.setData('application/json', JSON.stringify(window.draggedComponent));
    e.dataTransfer.effectAllowed = 'copy';

    createDropIndicator();
    updateStatus('Dragging: ' + draggedComponent.name);
}

function onComponentDragEnd(e) {
    removeDropIndicator();
    window.draggedComponent = null;
    updateStatus('Ready');
}

function onCanvasDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    if (dropIndicator && draggedComponent) {
        const canvas = document.getElementById('assemblyCanvas');
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + canvas.parentElement.scrollLeft;
        const y = e.clientY - rect.top + canvas.parentElement.scrollTop;

        const gridX = Math.floor(x / Studio.gridCellSize);
        const gridY = Math.floor(y / Studio.gridCellSize);

        dropIndicator.style.left = (gridX * Studio.gridCellSize) + 'px';
        dropIndicator.style.top = (gridY * Studio.gridCellSize) + 'px';
        dropIndicator.style.width = (draggedComponent.width * Studio.gridCellSize) + 'px';
        dropIndicator.style.height = (draggedComponent.height * Studio.gridCellSize) + 'px';
        dropIndicator.style.display = 'block';
    }
}

function onCanvasDragLeave(e) {
    if (dropIndicator) {
        dropIndicator.style.display = 'none';
    }
}

async function onCanvasDrop(e) {
    e.preventDefault();
    removeDropIndicator();

    if (!draggedComponent) return;

    // Save reference before async operations
    const componentToPlace = { ...draggedComponent };
    draggedComponent = null; // Clear immediately to prevent race conditions

    const canvas = document.getElementById('assemblyCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left + canvas.parentElement.scrollLeft;
    const y = e.clientY - rect.top + canvas.parentElement.scrollTop;

    const gridX = Math.floor(x / Studio.gridCellSize);
    const gridY = Math.floor(y / Studio.gridCellSize);

    try {
        const response = await fetch('/api/drone/place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                componentId: componentToPlace.id,
                gridX: gridX,
                gridY: gridY
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            log('error', errorData.error || 'Failed to place component');
            return;
        }

        const placedComponent = await response.json();

        if (placedComponent && placedComponent.instanceId) {
            Studio.placedComponents.push(placedComponent);
            renderPlacedComponent(placedComponent, componentToPlace);
            updateMonitors();
            updateComponentCount();
            addToHierarchy(placedComponent.instanceId, placedComponent.name, componentToPlace.type);

            // Save to history for undo
            pushHistory({
                type: 'place',
                instanceId: placedComponent.instanceId,
                name: placedComponent.name,
                componentId: componentToPlace.id,
                gridX: gridX,
                gridY: gridY
            });
        } else {
            log('error', 'Invalid response from server');
        }
    } catch (error) {
        log('error', 'Failed to place component: ' + error.message);
    }
}

function createDropIndicator() {
    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        document.getElementById('gridOverlay').appendChild(dropIndicator);
    }
}

function removeDropIndicator() {
    if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
    }
}

// ===============================================
// Placed Components
// ===============================================
function renderPlacedComponents() {
    const overlay = document.getElementById('gridOverlay');
    if (!overlay) return;

    overlay.innerHTML = '';

    Studio.placedComponents.forEach(placed => {
        const component = Studio.components.find(c => c.id === placed.componentId);
        if (component) {
            renderPlacedComponent(placed, component);
        }
    });
}

function renderPlacedComponent(placed, componentData) {
    const overlay = document.getElementById('gridOverlay');
    if (!overlay) return;

    // Use placed component data or fallback to componentData
    const width = (placed.width || componentData?.width || 1) * Studio.gridCellSize;
    const height = (placed.height || componentData?.height || 1) * Studio.gridCellSize;
    const componentType = placed.type || componentData?.type || placed.name || '';
    const componentColor = placed.color || componentData?.color || '#666';

    const el = document.createElement('div');
    el.className = 'placed-component';
    el.id = 'component-' + placed.instanceId;
    el.dataset.instanceId = placed.instanceId;
    el.style.left = (placed.gridX * Studio.gridCellSize) + 'px';
    el.style.top = (placed.gridY * Studio.gridCellSize) + 'px';
    el.style.width = width + 'px';
    el.style.height = height + 'px';

    // Get realistic SVG based on component type
    const svgContent = getComponentSVG(componentType, componentColor, width, height);

    el.innerHTML = `
        <div class="component-visual">${svgContent}</div>
        <span class="placed-component-name">${placed.name}</span>
    `;

    // Add event listeners
    el.addEventListener('click', (e) => selectComponent(e, placed.instanceId));
    el.addEventListener('contextmenu', (e) => showContextMenu(e, placed.instanceId));
    el.addEventListener('mousedown', (e) => startComponentDrag(e, placed.instanceId));

    overlay.appendChild(el);
}

// ===============================================
// Component Dragging (Move placed components)
// ===============================================
let draggingComponent = null;
let draggingComponents = []; // Multi-drag
let componentDragOffset = { x: 0, y: 0 };

function startComponentDrag(e, instanceId) {
    // Ignore right-click
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const el = document.getElementById('component-' + instanceId);
    if (!el) return;

    // Nếu component này chưa nằm trong selected thì chỉ chọn nó, còn nếu đã nằm trong selected thì giữ nguyên multi-select
    if (!Studio.selectedComponents.includes(instanceId)) {
        clearSelection();
        el.classList.add('selected');
        Studio.selectedComponent = instanceId;
        Studio.selectedComponents = [instanceId];
    }
    // Nếu đã nằm trong selectedComponents thì giữ nguyên trạng thái multi-select, không clearSelection

    // Build dragging list
    draggingComponents = [];
    Studio.selectedComponents.forEach(id => {
        const element = document.getElementById('component-' + id);
        const placed = Studio.placedComponents.find(c => c.instanceId === id);
        if (element && placed) {
            draggingComponents.push({
                element: element,
                instanceId: id,
                name: placed.name,
                oldGridX: placed.gridX,
                oldGridY: placed.gridY,
                newGridX: placed.gridX,
                newGridY: placed.gridY
            });
            element.classList.add('dragging');
        }
    });

    // Use primary component for offset
    const placed = Studio.placedComponents.find(c => c.instanceId === instanceId);
    draggingComponent = {
        element: el,
        instanceId: instanceId,
        name: placed?.name || 'Component',
        oldGridX: placed?.gridX || 0,
        oldGridY: placed?.gridY || 0
    };

    const rect = el.getBoundingClientRect();
    componentDragOffset.x = e.clientX - rect.left;
    componentDragOffset.y = e.clientY - rect.top;

    document.addEventListener('mousemove', onComponentDrag);
    document.addEventListener('mouseup', stopComponentDrag);
}

function onComponentDrag(e) {
    if (!draggingComponent || draggingComponents.length === 0) return;

    const overlay = document.getElementById('gridOverlay');
    const canvas = document.getElementById('assemblyCanvas');
    if (!overlay || !canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const scrollLeft = canvas.parentElement.scrollLeft;
    const scrollTop = canvas.parentElement.scrollTop;

    // Calculate new position for primary component
    let x = e.clientX - canvasRect.left - componentDragOffset.x + scrollLeft;
    let y = e.clientY - canvasRect.top - componentDragOffset.y + scrollTop;

    // Snap to grid
    const newGridX = Math.max(0, Math.round(x / Studio.gridCellSize));
    const newGridY = Math.max(0, Math.round(y / Studio.gridCellSize));

    // Calculate delta
    const deltaX = newGridX - draggingComponent.oldGridX;
    const deltaY = newGridY - draggingComponent.oldGridY;

    // Update all dragging components
    draggingComponents.forEach(comp => {
        comp.newGridX = comp.oldGridX + deltaX;
        comp.newGridY = comp.oldGridY + deltaY;

        // Ensure non-negative
        comp.newGridX = Math.max(0, comp.newGridX);
        comp.newGridY = Math.max(0, comp.newGridY);

        // Update visual position
        comp.element.style.left = (comp.newGridX * Studio.gridCellSize) + 'px';
        comp.element.style.top = (comp.newGridY * Studio.gridCellSize) + 'px';
    });

    // Store new grid position for primary
    draggingComponent.newGridX = newGridX;
    draggingComponent.newGridY = newGridY;
}

async function stopComponentDrag(e) {
    if (!draggingComponent || draggingComponents.length === 0) {
        document.removeEventListener('mousemove', onComponentDrag);
        document.removeEventListener('mouseup', stopComponentDrag);
        return;
    }

    // Remove dragging class
    draggingComponents.forEach(comp => {
        comp.element.classList.remove('dragging');
    });

    // Check if any component moved
    const movedComponents = draggingComponents.filter(comp =>
        comp.newGridX !== comp.oldGridX || comp.newGridY !== comp.oldGridY
    );

    if (movedComponents.length > 0) {
        try {
            // Update all moved components on server
            for (const comp of movedComponents) {
                const response = await fetch('/api/drone/update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceId: comp.instanceId,
                        gridX: comp.newGridX,
                        gridY: comp.newGridY
                    })
                });

                if (response.ok) {
                    // Update local state
                    const placed = Studio.placedComponents.find(c => c.instanceId === comp.instanceId);
                    if (placed) {
                        placed.gridX = comp.newGridX;
                        placed.gridY = comp.newGridY;
                    }
                }
            }

            // Save to history for undo (multi-move)
            if (movedComponents.length === 1) {
                pushHistory({
                    type: 'move',
                    instanceId: movedComponents[0].instanceId,
                    name: movedComponents[0].name,
                    oldGridX: movedComponents[0].oldGridX,
                    oldGridY: movedComponents[0].oldGridY,
                    newGridX: movedComponents[0].newGridX,
                    newGridY: movedComponents[0].newGridY
                });
            } else {
                pushHistory({
                    type: 'multi-move',
                    components: movedComponents.map(c => ({
                        instanceId: c.instanceId,
                        name: c.name,
                        oldGridX: c.oldGridX,
                        oldGridY: c.oldGridY,
                        newGridX: c.newGridX,
                        newGridY: c.newGridY
                    }))
                });
            }
        } catch (error) {
            log('error', 'Failed to update position');
        }
    }

    draggingComponent = null;
    draggingComponents = [];
    document.removeEventListener('mousemove', onComponentDrag);
    document.removeEventListener('mouseup', stopComponentDrag);
}

// Get realistic SVG for drone components
function getComponentSVG(type, color, width, height) {
    const typeLower = (type || '').toString().toLowerCase();
    const w = width - 8;
    const h = height - 20;

    // Quadcopter/Hexacopter Body - top-down 3D view
    if (typeLower.includes('quadcopter') || typeLower.includes('body')) {
        return `<svg viewBox="0 0 120 120" width="${w}" height="${h}">
            <defs>
                <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#3d3d3d"/>
                    <stop offset="50%" style="stop-color:#2a2a2a"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
                <linearGradient id="armGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#444"/>
                    <stop offset="50%" style="stop-color:#333"/>
                    <stop offset="100%" style="stop-color:#222"/>
                </linearGradient>
                <radialGradient id="motorMount" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" style="stop-color:#555"/>
                    <stop offset="100%" style="stop-color:#333"/>
                </radialGradient>
            </defs>
            <!-- Arms -->
            <rect x="55" y="10" width="10" height="45" rx="2" fill="url(#armGrad)" transform="rotate(45 60 60)"/>
            <rect x="55" y="10" width="10" height="45" rx="2" fill="url(#armGrad)" transform="rotate(135 60 60)"/>
            <rect x="55" y="10" width="10" height="45" rx="2" fill="url(#armGrad)" transform="rotate(225 60 60)"/>
            <rect x="55" y="10" width="10" height="45" rx="2" fill="url(#armGrad)" transform="rotate(315 60 60)"/>
            <!-- Center body -->
            <ellipse cx="60" cy="60" rx="22" ry="22" fill="url(#bodyGrad)" stroke="#555" stroke-width="2"/>
            <ellipse cx="60" cy="58" rx="18" ry="16" fill="#2d2d2d"/>
            <!-- Motor mounts -->
            <circle cx="25" cy="25" r="12" fill="url(#motorMount)" stroke="#666" stroke-width="1"/>
            <circle cx="95" cy="25" r="12" fill="url(#motorMount)" stroke="#666" stroke-width="1"/>
            <circle cx="25" cy="95" r="12" fill="url(#motorMount)" stroke="#666" stroke-width="1"/>
            <circle cx="95" cy="95" r="12" fill="url(#motorMount)" stroke="#666" stroke-width="1"/>
            <!-- Motor details -->
            <circle cx="25" cy="25" r="6" fill="#222"/>
            <circle cx="95" cy="25" r="6" fill="#222"/>
            <circle cx="25" cy="95" r="6" fill="#222"/>
            <circle cx="95" cy="95" r="6" fill="#222"/>
            <!-- LED indicators -->
            <circle cx="60" cy="42" r="2" fill="#4caf50"/>
            <circle cx="70" cy="60" r="2" fill="#f44336"/>
        </svg>`;
    }

    if (typeLower.includes('hexacopter')) {
        return `<svg viewBox="0 0 120 120" width="${w}" height="${h}">
            <defs>
                <linearGradient id="hexBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#3d3d3d"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
            </defs>
            <!-- 6 Arms -->
            <rect x="55" y="8" width="10" height="40" rx="2" fill="#333" transform="rotate(0 60 60)"/>
            <rect x="55" y="8" width="10" height="40" rx="2" fill="#333" transform="rotate(60 60 60)"/>
            <rect x="55" y="8" width="10" height="40" rx="2" fill="#333" transform="rotate(120 60 60)"/>
            <rect x="55" y="8" width="10" height="40" rx="2" fill="#333" transform="rotate(180 60 60)"/>
            <rect x="55" y="8" width="10" height="40" rx="2" fill="#333" transform="rotate(240 60 60)"/>
            <rect x="55" y="8" width="10" height="40" rx="2" fill="#333" transform="rotate(300 60 60)"/>
            <!-- Center -->
            <circle cx="60" cy="60" r="20" fill="url(#hexBodyGrad)" stroke="#555" stroke-width="2"/>
            <!-- 6 Motors -->
            <circle cx="60" cy="15" r="10" fill="#444" stroke="#666" stroke-width="1"/>
            <circle cx="99" cy="37" r="10" fill="#444" stroke="#666" stroke-width="1"/>
            <circle cx="99" cy="83" r="10" fill="#444" stroke="#666" stroke-width="1"/>
            <circle cx="60" cy="105" r="10" fill="#444" stroke="#666" stroke-width="1"/>
            <circle cx="21" cy="83" r="10" fill="#444" stroke="#666" stroke-width="1"/>
            <circle cx="21" cy="37" r="10" fill="#444" stroke="#666" stroke-width="1"/>
        </svg>`;
    }

    // Motor SVG - realistic brushless motor 3D
    if (typeLower.includes('motor')) {
        return `<svg viewBox="0 0 60 70" width="${w}" height="${h}">
            <defs>
                <linearGradient id="motorGrad3D" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#666"/>
                    <stop offset="30%" style="stop-color:#444"/>
                    <stop offset="70%" style="stop-color:#333"/>
                    <stop offset="100%" style="stop-color:#222"/>
                </linearGradient>
                <linearGradient id="motorTop" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#555"/>
                    <stop offset="100%" style="stop-color:#333"/>
                </linearGradient>
                <linearGradient id="shaftGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#888"/>
                    <stop offset="50%" style="stop-color:#aaa"/>
                    <stop offset="100%" style="stop-color:#666"/>
                </linearGradient>
            </defs>
            <!-- Motor base/stator -->
            <ellipse cx="30" cy="55" rx="22" ry="8" fill="#222"/>
            <!-- Motor body -->
            <rect x="10" y="25" width="40" height="30" rx="2" fill="url(#motorGrad3D)"/>
            <ellipse cx="30" cy="25" rx="20" ry="7" fill="url(#motorTop)"/>
            <!-- Winding slots -->
            <rect x="14" y="30" width="4" height="18" fill="#1a1a1a"/>
            <rect x="22" y="30" width="4" height="18" fill="#1a1a1a"/>
            <rect x="30" y="30" width="4" height="18" fill="#1a1a1a"/>
            <rect x="38" y="30" width="4" height="18" fill="#1a1a1a"/>
            <!-- Top bell -->
            <ellipse cx="30" cy="20" rx="16" ry="5" fill="#444" stroke="#555" stroke-width="1"/>
            <rect x="14" y="12" width="32" height="10" rx="2" fill="#3a3a3a"/>
            <ellipse cx="30" cy="12" rx="16" ry="5" fill="#4a4a4a"/>
            <!-- Shaft -->
            <rect x="27" y="2" width="6" height="12" fill="url(#shaftGrad)"/>
            <ellipse cx="30" cy="2" rx="3" ry="1" fill="#aaa"/>
            <!-- Wires -->
            <path d="M15 55 Q10 60 8 65" stroke="#e74c3c" stroke-width="2" fill="none"/>
            <path d="M30 55 Q30 62 28 65" stroke="#f1c40f" stroke-width="2" fill="none"/>
            <path d="M45 55 Q50 60 52 65" stroke="#2c3e50" stroke-width="2" fill="none"/>
        </svg>`;
    }

    // Frame SVG - carbon fiber X frame
    if (typeLower.includes('frame')) {
        return `<svg viewBox="0 0 100 100" width="${w}" height="${h}">
            <defs>
                <linearGradient id="carbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#4a4a4a"/>
                    <stop offset="25%" style="stop-color:#2a2a2a"/>
                    <stop offset="50%" style="stop-color:#3a3a3a"/>
                    <stop offset="75%" style="stop-color:#2a2a2a"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
                <pattern id="carbonPattern" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
                    <rect width="4" height="4" fill="#2a2a2a"/>
                    <rect width="2" height="2" fill="#333"/>
                    <rect x="2" y="2" width="2" height="2" fill="#333"/>
                </pattern>
            </defs>
            <!-- X arms with carbon fiber look -->
            <rect x="8" y="45" width="84" height="10" rx="2" fill="url(#carbonPattern)" stroke="#555" stroke-width="1" transform="rotate(45 50 50)"/>
            <rect x="8" y="45" width="84" height="10" rx="2" fill="url(#carbonPattern)" stroke="#555" stroke-width="1" transform="rotate(-45 50 50)"/>
            <!-- Center plate -->
            <rect x="30" y="30" width="40" height="40" rx="4" fill="url(#carbonGrad)" stroke="#666" stroke-width="2"/>
            <!-- Mounting holes -->
            <circle cx="38" cy="38" r="3" fill="#1a1a1a" stroke="#444" stroke-width="1"/>
            <circle cx="62" cy="38" r="3" fill="#1a1a1a" stroke="#444" stroke-width="1"/>
            <circle cx="38" cy="62" r="3" fill="#1a1a1a" stroke="#444" stroke-width="1"/>
            <circle cx="62" cy="62" r="3" fill="#1a1a1a" stroke="#444" stroke-width="1"/>
            <!-- Center hole -->
            <circle cx="50" cy="50" r="8" fill="#1a1a1a" stroke="#444" stroke-width="1"/>
        </svg>`;
    }

    // Battery SVG - LiPo battery 3D
    if (typeLower.includes('battery')) {
        return `<svg viewBox="0 0 90 50" width="${w}" height="${h}">
            <defs>
                <linearGradient id="battGrad3D" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#555"/>
                    <stop offset="20%" style="stop-color:#444"/>
                    <stop offset="80%" style="stop-color:#333"/>
                    <stop offset="100%" style="stop-color:#222"/>
                </linearGradient>
                <linearGradient id="battTop" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#4a4a4a"/>
                    <stop offset="100%" style="stop-color:#3a3a3a"/>
                </linearGradient>
            </defs>
            <!-- Battery body -->
            <rect x="5" y="15" width="70" height="30" rx="3" fill="url(#battGrad3D)" stroke="#555" stroke-width="1"/>
            <!-- Top highlight -->
            <rect x="5" y="12" width="70" height="8" rx="3" fill="url(#battTop)"/>
            <!-- Cells indication -->
            <rect x="10" y="18" width="15" height="22" rx="1" fill="#2a2a2a" stroke="#444" stroke-width="1"/>
            <rect x="27" y="18" width="15" height="22" rx="1" fill="#2a2a2a" stroke="#444" stroke-width="1"/>
            <rect x="44" y="18" width="15" height="22" rx="1" fill="#2a2a2a" stroke="#444" stroke-width="1"/>
            <rect x="61" y="18" width="10" height="22" rx="1" fill="#2a2a2a" stroke="#444" stroke-width="1"/>
            <!-- Connector -->
            <rect x="75" y="22" width="10" height="14" rx="2" fill="#333" stroke="#555" stroke-width="1"/>
            <rect x="80" y="25" width="5" height="3" fill="#c62828"/>
            <rect x="80" y="30" width="5" height="3" fill="#1a1a1a"/>
            <!-- Label -->
            <text x="37" y="33" font-size="6" fill="#666" text-anchor="middle">4S 1500mAh</text>
            <!-- Balance connector -->
            <rect x="30" y="5" width="20" height="8" rx="1" fill="#222" stroke="#444" stroke-width="1"/>
            <circle cx="35" cy="9" r="1.5" fill="#fff"/>
            <circle cx="40" cy="9" r="1.5" fill="#f44336"/>
            <circle cx="45" cy="9" r="1.5" fill="#2196f3"/>
        </svg>`;
    }

    // Propeller SVG - 3D tri-blade
    if (typeLower.includes('prop')) {
        return `<svg viewBox="0 0 70 70" width="${w}" height="${h}">
            <defs>
                <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#444"/>
                    <stop offset="50%" style="stop-color:#333"/>
                    <stop offset="100%" style="stop-color:#222"/>
                </linearGradient>
            </defs>
            <!-- 3 blades -->
            <ellipse cx="35" cy="35" rx="28" ry="5" fill="url(#bladeGrad)" stroke="#555" stroke-width="1" transform="rotate(0 35 35)"/>
            <ellipse cx="35" cy="35" rx="28" ry="5" fill="url(#bladeGrad)" stroke="#555" stroke-width="1" transform="rotate(120 35 35)"/>
            <ellipse cx="35" cy="35" rx="28" ry="5" fill="url(#bladeGrad)" stroke="#555" stroke-width="1" transform="rotate(240 35 35)"/>
            <!-- Hub -->
            <circle cx="35" cy="35" r="8" fill="#3a3a3a" stroke="#666" stroke-width="2"/>
            <circle cx="35" cy="35" r="4" fill="#222"/>
            <!-- Direction indicator -->
            <path d="M35 28 L38 32 L32 32 Z" fill="#4caf50"/>
        </svg>`;
    }

    // ESC SVG - 4-in-1 3D
    if (typeLower.includes('esc')) {
        return `<svg viewBox="0 0 60 60" width="${w}" height="${h}">
            <defs>
                <linearGradient id="escGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#2a2a2a"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
            </defs>
            <!-- PCB board -->
            <rect x="5" y="10" width="50" height="45" rx="3" fill="url(#escGrad)" stroke="#444" stroke-width="1"/>
            <rect x="5" y="8" width="50" height="6" rx="2" fill="#333"/>
            <!-- MOSFETs -->
            <rect x="10" y="18" width="10" height="12" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <rect x="25" y="18" width="10" height="12" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <rect x="40" y="18" width="10" height="12" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <rect x="10" y="35" width="10" height="12" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <rect x="25" y="35" width="10" height="12" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <rect x="40" y="35" width="10" height="12" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <!-- Capacitor -->
            <circle cx="30" cy="52" r="4" fill="#333" stroke="#555" stroke-width="1"/>
            <!-- Input wires -->
            <line x1="15" y1="5" x2="15" y2="10" stroke="#c62828" stroke-width="3"/>
            <line x1="30" y1="5" x2="30" y2="10" stroke="#1a1a1a" stroke-width="3"/>
            <line x1="45" y1="5" x2="45" y2="10" stroke="#ffa000" stroke-width="3"/>
        </svg>`;
    }

    // Flight Controller SVG - 3D detailed
    if (typeLower.includes('controller') || typeLower.includes('fc')) {
        return `<svg viewBox="0 0 60 60" width="${w}" height="${h}">
            <defs>
                <linearGradient id="fcGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#2d2d2d"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
            </defs>
            <!-- Main PCB -->
            <rect x="5" y="5" width="50" height="50" rx="3" fill="url(#fcGrad)" stroke="#444" stroke-width="2"/>
            <!-- Processor -->
            <rect x="20" y="20" width="20" height="20" rx="2" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <text x="30" y="33" font-size="6" fill="#666" text-anchor="middle">F7</text>
            <!-- Gyro -->
            <rect x="8" y="10" width="12" height="10" rx="1" fill="#222" stroke="#555" stroke-width="1"/>
            <circle cx="14" cy="15" r="2" fill="#333"/>
            <!-- Flash -->
            <rect x="40" y="10" width="12" height="8" rx="1" fill="#222" stroke="#555" stroke-width="1"/>
            <!-- USB port -->
            <rect x="25" y="48" width="10" height="8" rx="1" fill="#333" stroke="#555" stroke-width="1"/>
            <!-- Solder pads -->
            <circle cx="10" cy="50" r="2" fill="#c0a000"/>
            <circle cx="18" cy="50" r="2" fill="#c0a000"/>
            <circle cx="42" cy="50" r="2" fill="#c0a000"/>
            <circle cx="50" cy="50" r="2" fill="#c0a000"/>
            <!-- Status LED -->
            <circle cx="50" cy="10" r="2" fill="#4caf50"/>
            <!-- Mounting holes -->
            <circle cx="8" cy="8" r="2" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <circle cx="52" cy="8" r="2" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <circle cx="8" cy="52" r="2" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <circle cx="52" cy="52" r="2" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
        </svg>`;
    }

    // Camera SVG - FPV Camera 3D
    if (typeLower.includes('camera')) {
        return `<svg viewBox="0 0 50 50" width="${w}" height="${h}">
            <defs>
                <radialGradient id="lensGrad" cx="50%" cy="30%" r="50%">
                    <stop offset="0%" style="stop-color:#3a3a5a"/>
                    <stop offset="70%" style="stop-color:#1a1a2a"/>
                    <stop offset="100%" style="stop-color:#0a0a1a"/>
                </radialGradient>
                <linearGradient id="camBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#3a3a3a"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
            </defs>
            <!-- Camera body -->
            <rect x="5" y="12" width="40" height="30" rx="4" fill="url(#camBodyGrad)" stroke="#555" stroke-width="2"/>
            <!-- Lens housing -->
            <circle cx="25" cy="27" r="14" fill="#222" stroke="#555" stroke-width="2"/>
            <!-- Lens -->
            <circle cx="25" cy="27" r="10" fill="url(#lensGrad)" stroke="#444" stroke-width="1"/>
            <circle cx="25" cy="27" r="5" fill="#1a1a3a"/>
            <circle cx="23" cy="24" r="2" fill="rgba(255,255,255,0.1)"/>
            <!-- Sensor -->
            <rect x="38" y="16" width="5" height="6" rx="1" fill="#333"/>
            <!-- Mount bracket -->
            <rect x="8" y="8" width="6" height="6" fill="#444" stroke="#555" stroke-width="1"/>
            <rect x="36" y="8" width="6" height="6" fill="#444" stroke="#555" stroke-width="1"/>
        </svg>`;
    }

    // GPS SVG - GPS Module 3D
    if (typeLower.includes('gps')) {
        return `<svg viewBox="0 0 50 60" width="${w}" height="${h}">
            <defs>
                <linearGradient id="gpsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#333"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
            </defs>
            <!-- Antenna mast -->
            <rect x="22" y="5" width="6" height="25" rx="1" fill="#444" stroke="#555" stroke-width="1"/>
            <!-- Antenna top -->
            <ellipse cx="25" cy="5" rx="8" ry="4" fill="#333" stroke="#555" stroke-width="1"/>
            <circle cx="25" cy="5" r="3" fill="#222"/>
            <!-- PCB base -->
            <rect x="5" y="30" width="40" height="25" rx="3" fill="url(#gpsGrad)" stroke="#444" stroke-width="1"/>
            <!-- GPS chip -->
            <rect x="12" y="35" width="16" height="12" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <text x="20" y="44" font-size="5" fill="#666" text-anchor="middle">M8N</text>
            <!-- Connector -->
            <rect x="32" y="38" width="8" height="8" rx="1" fill="#333" stroke="#555" stroke-width="1"/>
            <!-- Status LEDs -->
            <circle cx="10" cy="50" r="2" fill="#4caf50"/>
            <circle cx="18" cy="50" r="2" fill="#2196f3"/>
            <circle cx="26" cy="50" r="2" fill="#ff9800"/>
        </svg>`;
    }

    // Receiver SVG - 3D
    if (typeLower.includes('receiver') || typeLower.includes('rx')) {
        return `<svg viewBox="0 0 45 40" width="${w}" height="${h}">
            <defs>
                <linearGradient id="rxGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#2d2d2d"/>
                    <stop offset="100%" style="stop-color:#1a1a1a"/>
                </linearGradient>
            </defs>
            <!-- PCB -->
            <rect x="5" y="12" width="35" height="23" rx="2" fill="url(#rxGrad)" stroke="#444" stroke-width="1"/>
            <!-- Antenna connectors -->
            <rect x="10" y="5" width="4" height="10" fill="#c0a000" stroke="#888" stroke-width="1"/>
            <rect x="31" y="5" width="4" height="10" fill="#c0a000" stroke="#888" stroke-width="1"/>
            <!-- Antennas -->
            <line x1="12" y1="5" x2="8" y2="0" stroke="#333" stroke-width="2"/>
            <line x1="33" y1="5" x2="37" y2="0" stroke="#333" stroke-width="2"/>
            <!-- Chip -->
            <rect x="15" y="18" width="15" height="10" rx="1" fill="#1a1a1a" stroke="#555" stroke-width="1"/>
            <text x="22" y="25" font-size="4" fill="#666" text-anchor="middle">ELRS</text>
            <!-- Connector -->
            <rect x="12" y="30" width="20" height="5" fill="#333" stroke="#555" stroke-width="1"/>
            <!-- LED -->
            <circle cx="8" cy="20" r="2" fill="#4caf50"/>
        </svg>`;
    }

    // Default component
    return `<svg viewBox="0 0 40 40" width="${w}" height="${h}">
        <rect x="5" y="5" width="30" height="30" rx="3" fill="#2a2a2a" stroke="#555" stroke-width="2"/>
        <circle cx="20" cy="20" r="8" fill="#333" stroke="#666" stroke-width="1"/>
    </svg>`;
}

function selectComponent(e, instanceId) {
    e.stopPropagation();

    const el = document.getElementById('component-' + instanceId);
    if (!el) return;

    // Ctrl/Cmd click for multi-select
    if (e.ctrlKey || e.metaKey) {
        el.classList.toggle('selected');

        if (el.classList.contains('selected')) {
            if (!Studio.selectedComponents.includes(instanceId)) {
                Studio.selectedComponents.push(instanceId);
            }
            Studio.selectedComponent = instanceId;
        } else {
            Studio.selectedComponents = Studio.selectedComponents.filter(id => id !== instanceId);
            Studio.selectedComponent = Studio.selectedComponents[0] || null;
        }
    } else {
        // Normal click - single select
        clearSelection();
        el.classList.add('selected');
        Studio.selectedComponent = instanceId;
        Studio.selectedComponents = [instanceId];
    }
}

// ===============================================
// Canvas Events
// ===============================================
function initCanvasEvents() {
    const canvas = document.getElementById('assemblyCanvas');
    if (!canvas) return;

    // Click to deselect
    canvas.addEventListener('click', (e) => {
        if (e.target.id === 'assemblyCanvas' || e.target.id === 'gridOverlay') {
            clearSelection();
            hideContextMenu();
        }
    });

    // Mouse position tracking
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + canvas.parentElement.scrollLeft;
        const y = e.clientY - rect.top + canvas.parentElement.scrollTop;
        const gridX = Math.floor(x / Studio.gridCellSize);
        const gridY = Math.floor(y / Studio.gridCellSize);
        document.getElementById('cursorPosition').textContent = `Grid: ${gridX}, ${gridY}`;

        // Marquee selection
        if (Studio.isMarqueeSelecting) {
            updateMarquee(e);
        }
    });

    // Marquee selection - mouse down
    canvas.addEventListener('mousedown', (e) => {
        // Only start marquee if clicking on empty area
        if (e.target.id === 'assemblyCanvas' || e.target.id === 'gridOverlay' || e.target.closest('.grid-background')) {
            if (e.button === 0) { // Left click only
                startMarquee(e, canvas);
            }
        }
    });

    // Marquee selection - mouse up
    canvas.addEventListener('mouseup', (e) => {
        if (Studio.isMarqueeSelecting) {
            endMarquee(canvas);
        }
    });

    // Mouse leave - end marquee
    canvas.addEventListener('mouseleave', () => {
        if (Studio.isMarqueeSelecting) {
            endMarquee(canvas);
        }
    });
}

// ===============================================
// Marquee Selection
// ===============================================
function startMarquee(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    Studio.isMarqueeSelecting = true;
    Studio.marqueeStart = {
        x: e.clientX - rect.left + canvas.parentElement.scrollLeft,
        y: e.clientY - rect.top + canvas.parentElement.scrollTop
    };

    // Create marquee element
    let marquee = document.getElementById('marqueeSelection');
    if (!marquee) {
        marquee = document.createElement('div');
        marquee.id = 'marqueeSelection';
        marquee.className = 'marquee-selection';
        document.getElementById('gridOverlay').appendChild(marquee);
    }

    marquee.style.left = Studio.marqueeStart.x + 'px';
    marquee.style.top = Studio.marqueeStart.y + 'px';
    marquee.style.width = '0';
    marquee.style.height = '0';
    marquee.style.display = 'block';
}

function updateMarquee(e) {
    const marquee = document.getElementById('marqueeSelection');
    if (!marquee) return;

    const canvas = document.getElementById('assemblyCanvas');
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left + canvas.parentElement.scrollLeft;
    const currentY = e.clientY - rect.top + canvas.parentElement.scrollTop;

    const left = Math.min(Studio.marqueeStart.x, currentX);
    const top = Math.min(Studio.marqueeStart.y, currentY);
    const width = Math.abs(currentX - Studio.marqueeStart.x);
    const height = Math.abs(currentY - Studio.marqueeStart.y);

    marquee.style.left = left + 'px';
    marquee.style.top = top + 'px';
    marquee.style.width = width + 'px';
    marquee.style.height = height + 'px';

    // Highlight components within marquee
    highlightComponentsInMarquee(left, top, width, height);
}

function endMarquee(canvas) {
    Studio.isMarqueeSelecting = false;

    const marquee = document.getElementById('marqueeSelection');
    if (marquee) {
        const left = parseInt(marquee.style.left);
        const top = parseInt(marquee.style.top);
        const width = parseInt(marquee.style.width);
        const height = parseInt(marquee.style.height);

        // Select components within marquee
        if (width > 5 && height > 5) { // Minimum size to count as selection
            selectComponentsInRect(left, top, width, height);
        }

        marquee.style.display = 'none';
    }
}

function highlightComponentsInMarquee(left, top, width, height) {
    document.querySelectorAll('.placed-component').forEach(el => {
        const elRect = {
            left: parseInt(el.style.left),
            top: parseInt(el.style.top),
            width: el.offsetWidth,
            height: el.offsetHeight
        };

        const inMarquee = rectsIntersect(
            { left, top, width, height },
            elRect
        );

        el.classList.toggle('marquee-hover', inMarquee);
    });
}

function selectComponentsInRect(left, top, width, height) {
    clearSelection();

    document.querySelectorAll('.placed-component').forEach(el => {
        const elRect = {
            left: parseInt(el.style.left),
            top: parseInt(el.style.top),
            width: el.offsetWidth,
            height: el.offsetHeight
        };

        if (rectsIntersect({ left, top, width, height }, elRect)) {
            el.classList.add('selected');
            el.classList.remove('marquee-hover');
            const instanceId = el.id.replace('component-', '');
            if (!Studio.selectedComponents.includes(instanceId)) {
                Studio.selectedComponents.push(instanceId);
            }
        }
    });

    if (Studio.selectedComponents.length > 0) {
        Studio.selectedComponent = Studio.selectedComponents[0];
    }
}

function rectsIntersect(r1, r2) {
    return !(r2.left > r1.left + r1.width ||
        r2.left + r2.width < r1.left ||
        r2.top > r1.top + r1.height ||
        r2.top + r2.height < r1.top);
}

function clearSelection() {
    document.querySelectorAll('.placed-component.selected').forEach(el => {
        el.classList.remove('selected');
    });
    document.querySelectorAll('.placed-component.marquee-hover').forEach(el => {
        el.classList.remove('marquee-hover');
    });
    Studio.selectedComponent = null;
    Studio.selectedComponents = [];
}

// ===============================================
// Context Menu
// ===============================================
function showContextMenu(e, instanceId) {
    e.preventDefault();
    selectComponent(e, instanceId);

    const menu = document.getElementById('contextMenu');
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('visible');

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

function hideContextMenu() {
    document.getElementById('contextMenu').classList.remove('visible');
}

async function deleteSelected() {
    hideContextMenu();

    // Delete all selected components
    const toDelete = Studio.selectedComponents.length > 0
        ? [...Studio.selectedComponents]
        : (Studio.selectedComponent ? [Studio.selectedComponent] : []);

    if (toDelete.length === 0) {
        log('warning', 'No component selected');
        return;
    }

    try {
        let deletedCount = 0;

        for (const instanceId of toDelete) {
            const response = await fetch(`/api/drone/remove/${instanceId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Remove from DOM
                document.getElementById('component-' + instanceId)?.remove();

                // Remove from hierarchy
                const hierarchyNode = document.querySelector(`[data-node-id="${instanceId}"]`);
                if (hierarchyNode) hierarchyNode.remove();

                // Remove from state
                Studio.placedComponents = Studio.placedComponents.filter(
                    p => p.instanceId !== instanceId
                );
                deletedCount++;
            }
        }

        // Clear selection
        Studio.selectedComponent = null;
        Studio.selectedComponents = [];

        updateMonitors();
        updateComponentCount();
    } catch (error) {
        log('error', 'Failed to delete: ' + error.message);
    }
}

function duplicateSelected() {
    hideContextMenu();
    log('info', 'Duplicate coming soon');
}

function rotateSelected() {
    hideContextMenu();
    log('info', 'Rotate coming soon');
}

// Select all components on canvas
function selectAllComponents() {
    clearSelection();

    document.querySelectorAll('.placed-component').forEach(el => {
        el.classList.add('selected');
        const instanceId = el.id.replace('component-', '');
        Studio.selectedComponents.push(instanceId);
    });

    if (Studio.selectedComponents.length > 0) {
        Studio.selectedComponent = Studio.selectedComponents[0];
    }
}


// ===============================================
// Visual Programming Blocks
// ===============================================
let draggedBlock = null;
let deleteZone = null;
// Marquee selection for code blocks
let isCodeMarqueeSelecting = false;
let codeMarqueeStart = { x: 0, y: 0 };
let codeMarqueeBox = null;

function initBlocksDragDrop() {
    document.querySelectorAll('.code-block').forEach(block => {
        block.addEventListener('dragstart', onBlockDragStart);
        block.addEventListener('dragend', onBlockDragEnd);
    });

    const workspace = document.getElementById('codeWorkspaceInner');
    if (workspace) {
        workspace.addEventListener('dragover', onWorkspaceDragOver);
        workspace.addEventListener('drop', onWorkspaceDrop);

        // Marquee selection events
        workspace.addEventListener('mousedown', (e) => {
            // Chỉ không cho quét khi click vào block hoặc delete-zone
            if (e.button !== 0) return;
            if (e.target.closest('.dropped-block') || e.target.closest('.delete-zone')) return;
            isCodeMarqueeSelecting = true;
            const rect = workspace.getBoundingClientRect();
            codeMarqueeStart = {
                x: e.clientX - rect.left + workspace.parentElement.scrollLeft,
                y: e.clientY - rect.top + workspace.parentElement.scrollTop
            };
            codeMarqueeBox = document.createElement('div');
            codeMarqueeBox.className = 'marquee-selection';
            codeMarqueeBox.style.left = codeMarqueeStart.x + 'px';
            codeMarqueeBox.style.top = codeMarqueeStart.y + 'px';
            codeMarqueeBox.style.width = '0';
            codeMarqueeBox.style.height = '0';
            codeMarqueeBox.style.display = 'block';
            workspace.appendChild(codeMarqueeBox);
        });
        workspace.addEventListener('mousemove', (e) => {
            if (!isCodeMarqueeSelecting || !codeMarqueeBox) return;
            const rect = workspace.getBoundingClientRect();
            const currX = e.clientX - rect.left + workspace.parentElement.scrollLeft;
            const currY = e.clientY - rect.top + workspace.parentElement.scrollTop;
            const left = Math.min(codeMarqueeStart.x, currX);
            const top = Math.min(codeMarqueeStart.y, currY);
            const width = Math.abs(currX - codeMarqueeStart.x);
            const height = Math.abs(currY - codeMarqueeStart.y);
            codeMarqueeBox.style.left = left + 'px';
            codeMarqueeBox.style.top = top + 'px';
            codeMarqueeBox.style.width = width + 'px';
            codeMarqueeBox.style.height = height + 'px';
        });
        workspace.addEventListener('mouseup', (e) => {
            if (!isCodeMarqueeSelecting || !codeMarqueeBox) return;
            isCodeMarqueeSelecting = false;
            const left = parseInt(codeMarqueeBox.style.left);
            const top = parseInt(codeMarqueeBox.style.top);
            const width = parseInt(codeMarqueeBox.style.width);
            const height = parseInt(codeMarqueeBox.style.height);
            // Select blocks in rect
            document.querySelectorAll('.dropped-block').forEach(el => {
                const elRect = el.getBoundingClientRect();
                const wsRect = workspace.getBoundingClientRect();
                const elX = elRect.left - wsRect.left + workspace.parentElement.scrollLeft;
                const elY = elRect.top - wsRect.top + workspace.parentElement.scrollTop;
                const elW = el.offsetWidth;
                const elH = el.offsetHeight;
                const intersect = !(elX > left + width || elX + elW < left || elY > top + height || elY + elH < top);
                el.classList.toggle('selected', intersect);
                if (intersect) {
                    if (!Studio.selectedBlocks.includes(el.id)) Studio.selectedBlocks.push(el.id);
                } else {
                    Studio.selectedBlocks = Studio.selectedBlocks.filter(id => id !== el.id);
                }
            });
            codeMarqueeBox.remove();
            codeMarqueeBox = null;
        });

        // Create delete zone
        deleteZone = document.createElement('div');
        deleteZone.className = 'delete-zone';
        deleteZone.innerHTML = '<i class="bi bi-trash"></i> Drag here to delete';
        workspace.appendChild(deleteZone);
    }
}

function onBlockDragStart(e) {
    const blockEl = e.target.closest('.code-block');
    if (!blockEl) return;

    draggedBlock = {
        type: blockEl.dataset.blockType,
        category: Array.from(blockEl.classList).find(c =>
            ['motion', 'events', 'control', 'sensing', 'operators', 'variables'].includes(c)
        ),
        text: blockEl.innerText.trim(),
        innerHTML: blockEl.innerHTML
    };

    e.dataTransfer.setData('text/plain', draggedBlock.type);
    e.dataTransfer.effectAllowed = 'copy';
}

function onBlockDragEnd(e) {
    draggedBlock = null;
}

function onWorkspaceDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

function onWorkspaceDrop(e) {
    e.preventDefault();

    if (!draggedBlock) return;

    const workspace = document.getElementById('codeWorkspaceInner');
    const rect = workspace.getBoundingClientRect();
    const x = e.clientX - rect.left + workspace.parentElement.scrollLeft;
    const y = e.clientY - rect.top + workspace.parentElement.scrollTop;

    // Create dropped block
    const blockId = 'block-' + Date.now();
    const block = document.createElement('div');
    block.className = `dropped-block ${draggedBlock.category}`;
    block.id = blockId;
    block.dataset.blockType = draggedBlock.type;
    block.style.left = x + 'px';
    block.style.top = y + 'px';
    block.innerHTML = draggedBlock.innerHTML;

    // Make it movable
    block.addEventListener('mousedown', startBlockDrag);
    block.addEventListener('click', (e) => selectBlock(e, blockId));

    workspace.appendChild(block);

    Studio.droppedBlocks.push({
        id: blockId,
        type: draggedBlock.type,
        x: x,
        y: y
    });

    log('info', `Added block: ${draggedBlock.type}`);
    updateGeneratedCode();

    draggedBlock = null;
}

function selectBlock(e, blockId) {
    e.stopPropagation();
    const blockEl = document.getElementById(blockId);
    if (!blockEl) return;
    if (e.ctrlKey || e.metaKey) {
        // Multi-select
        blockEl.classList.toggle('selected');
        if (blockEl.classList.contains('selected')) {
            if (!Studio.selectedBlocks.includes(blockId)) Studio.selectedBlocks.push(blockId);
        } else {
            Studio.selectedBlocks = Studio.selectedBlocks.filter(id => id !== blockId);
        }
    } else {
        // Single select
        document.querySelectorAll('.dropped-block.selected').forEach(el => {
            el.classList.remove('selected');
        });
        blockEl.classList.add('selected');
        Studio.selectedBlocks = [blockId];
    }
}

let draggingBlock = null;
let draggingBlocks = [];
let dragOffset = { x: 0, y: 0 };

function startBlockDrag(e) {
    if (e.target.tagName === 'INPUT') return;
    draggingBlock = e.target.closest('.dropped-block');
    if (!draggingBlock) return;
    e.preventDefault();

    // Build draggingBlocks: nếu block đang kéo nằm trong nhóm đã chọn thì kéo cả nhóm, ngược lại chỉ kéo 1 block
    if (draggingBlock.classList.contains('selected') && Studio.selectedBlocks.length > 1) {
        draggingBlocks = Studio.selectedBlocks.map(id => {
            const el = document.getElementById(id);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                el,
                startX: rect.left,
                startY: rect.top,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top
            };
        }).filter(Boolean);
    } else {
        draggingBlocks = [{
            el: draggingBlock,
            startX: draggingBlock.getBoundingClientRect().left,
            startY: draggingBlock.getBoundingClientRect().top,
            offsetX: e.clientX - draggingBlock.getBoundingClientRect().left,
            offsetY: e.clientY - draggingBlock.getBoundingClientRect().top
        }];
        Studio.selectedBlocks = [draggingBlock.id];
        document.querySelectorAll('.dropped-block.selected').forEach(el => {
            el.classList.remove('selected');
        });
        draggingBlock.classList.add('selected');
    }
    draggingBlocks.forEach(b => b.el.classList.add('dragging'));

    // Show delete zone
    if (deleteZone) {
        deleteZone.classList.add('active');
    }
    document.addEventListener('mousemove', onBlockDrag);
    document.addEventListener('mouseup', stopBlockDrag);
}

function onBlockDrag(e) {
    if (!draggingBlocks.length) return;
    const workspace = document.getElementById('codeWorkspaceInner');
    const rect = workspace.getBoundingClientRect();
    draggingBlocks.forEach(b => {
        const x = e.clientX - b.offsetX - rect.left + workspace.parentElement.scrollLeft;
        const y = e.clientY - b.offsetY - rect.top + workspace.parentElement.scrollTop;
        b.el.style.left = Math.max(0, x) + 'px';
        b.el.style.top = Math.max(0, y) + 'px';
        // Update Studio.droppedBlocks vị trí mới
        const blockObj = Studio.droppedBlocks.find(bb => bb.id === b.el.id);
        if (blockObj) {
            blockObj.x = Math.max(0, x);
            blockObj.y = Math.max(0, y);
        }
    });
    // Check if over delete zone
    if (deleteZone) {
        const deleteRect = deleteZone.getBoundingClientRect();
        const isOverDelete = e.clientX >= deleteRect.left && e.clientX <= deleteRect.right &&
            e.clientY >= deleteRect.top && e.clientY <= deleteRect.bottom;
        deleteZone.classList.toggle('hover', isOverDelete);
    }
}

function stopBlockDrag(e) {
    if (!draggingBlocks.length) return;
    draggingBlocks.forEach(b => b.el.classList.remove('dragging'));
    // Check if dropped on delete zone
    if (deleteZone && deleteZone.classList.contains('hover')) {
        draggingBlocks.forEach(b => {
            b.el.remove();
            Studio.droppedBlocks = Studio.droppedBlocks.filter(bb => bb.id !== b.el.id);
        });
        updateGeneratedCode();
    }
    // Hide delete zone
    if (deleteZone) {
        deleteZone.classList.remove('active', 'hover');
    }
    draggingBlock = null;
    draggingBlocks = [];
    document.removeEventListener('mousemove', onBlockDrag);
    document.removeEventListener('mouseup', stopBlockDrag);
}

// Delete selected block with keyboard
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = document.querySelector('.dropped-block.selected');
        if (selected) {
            const blockId = selected.id;
            selected.remove();
            Studio.droppedBlocks = Studio.droppedBlocks.filter(b => b.id !== blockId);
            updateGeneratedCode();
        }
    }
});

// ===============================================
// Code Generation
// ===============================================
function updateGeneratedCode() {
    const editor = document.getElementById('codeEditor');
    if (!editor) return;

    let code = '// Generated from visual blocks\n\nasync function runDrone() {\n';

    // Sort blocks by Y position
    const sorted = [...Studio.droppedBlocks].sort((a, b) => a.y - b.y);

    sorted.forEach(block => {
        const el = document.getElementById(block.id);
        const value = el?.querySelector('input')?.value || '10';

        switch (block.type) {
            case 'takeoff':
                code += '    await drone.takeoff();\n';
                break;
            case 'land':
                code += '    await drone.land();\n';
                break;
            case 'move-up':
                code += `    await drone.moveUp(${value});\n`;
                break;
            case 'move-down':
                code += `    await drone.moveDown(${value});\n`;
                break;
            case 'move-forward':
                code += `    await drone.moveForward(${value});\n`;
                break;
            case 'move-back':
                code += `    await drone.moveBack(${value});\n`;
                break;
            case 'rotate-left':
                code += `    await drone.rotateLeft(${value});\n`;
                break;
            case 'rotate-right':
                code += `    await drone.rotateRight(${value});\n`;
                break;
            case 'hover':
                code += `    await drone.hover(${value} * 1000);\n`;
                break;
            case 'wait':
                code += `    await delay(${value} * 1000);\n`;
                break;
        }
    });

    code += '}\n';
    editor.value = code;
}

// ===============================================
// Monitors
// ===============================================
async function updateMonitors() {
    try {
        const response = await fetch('/api/drone/calculate');
        const result = await response.json();
        updateMonitorsWithResult(result);
    } catch (error) {
        log('error', 'Failed to update monitors');
    }
}

function updateMonitorsWithResult(result) {
    if (!result) return;

    document.getElementById('monitorWeight').textContent = (result.totalWeight || 0).toFixed(1) + ' g';
    document.getElementById('monitorThrust').textContent = (result.totalThrust || 0).toFixed(2) + ' kg';
    document.getElementById('monitorRatio').textContent = (result.thrustToWeightRatio || 0).toFixed(2) + ':1';
    document.getElementById('monitorPower').textContent = (result.totalPowerConsumption || 0).toFixed(1) + ' W';
    document.getElementById('monitorCapacity').textContent = (result.batteryCapacity || 0).toFixed(0) + ' mAh';
    document.getElementById('monitorFlightTime').textContent = (result.estimatedFlightTime || 0).toFixed(1) + ' min';

    const badge = document.getElementById('monitorCapability');
    const capability = result.flightCapability || 'N/A';
    badge.textContent = capability;
    badge.className = 'monitor-value badge ' + (
        capability === 'Cannot fly' ? 'bg-danger' :
            capability === 'Marginal' ? 'bg-warning' :
                capability === 'Good' ? 'bg-success' : 'bg-secondary'
    );

    // Diagnostics
    const diagList = document.getElementById('diagnosticsList');
    diagList.innerHTML = '';

    if (result.errors?.length) {
        result.errors.forEach(err => {
            diagList.innerHTML += `<div class="diagnostic-item error"><i class="bi bi-x-circle"></i>${err}</div>`;
        });
    }

    if (result.warnings?.length) {
        result.warnings.forEach(warn => {
            diagList.innerHTML += `<div class="diagnostic-item warning"><i class="bi bi-exclamation-triangle"></i>${warn}</div>`;
        });
    }

    if (result.isValid && !result.warnings?.length && !result.errors?.length) {
        diagList.innerHTML = `<div class="diagnostic-item success"><i class="bi bi-check-circle"></i>Config valid</div>`;
    }

    if (!result.errors?.length && !result.warnings?.length && !result.isValid) {
        diagList.innerHTML = `<div class="diagnostic-item"><i class="bi bi-info-circle"></i>Add components to start</div>`;
    }

    // Weight breakdown
    const total = result.totalWeight || 1;
    const frameEl = document.querySelector('.bar-segment.frame');
    const motorsEl = document.querySelector('.bar-segment.motors');
    const batteryEl = document.querySelector('.bar-segment.battery');
    const otherEl = document.querySelector('.bar-segment.other');

    if (frameEl) frameEl.style.width = ((result.frameWeight || 0) / total * 100) + '%';
    if (motorsEl) motorsEl.style.width = ((result.motorsWeight || 0) / total * 100) + '%';
    if (batteryEl) batteryEl.style.width = ((result.batteryWeight || 0) / total * 100) + '%';
    if (otherEl) otherEl.style.width = ((result.otherComponentsWeight || 0) / total * 100) + '%';
}

// ===============================================
// Keyboard
// ===============================================
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Undo: Ctrl+Z
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }

        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
            e.preventDefault();
            redo();
            return;
        }

        // Save: Ctrl+S
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveProject();
            return;
        }

        // Select All: Ctrl+A (when not in input)
        if (e.ctrlKey && e.key === 'a' && !isInput()) {
            e.preventDefault();
            selectAllComponents();
            return;
        }

        // Duplicate: Ctrl+D
        if (e.ctrlKey && e.key === 'd' && !isInput()) {
            e.preventDefault();
            duplicateSelected();
            return;
        }

        // Delete
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if ((Studio.selectedComponent || Studio.selectedComponents.length > 0) && !isInput()) {
                e.preventDefault();
                deleteSelected();
            }
        }

        // Escape - deselect
        if (e.key === 'Escape') {
            clearSelection();
            hideContextMenu();
        }

        // Space - play/pause
        if (e.key === ' ' && !isInput()) {
            e.preventDefault();
            togglePlay();
        }

        // Arrow keys - move selected component(s)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const hasSelection = Studio.selectedComponents.length > 0 || Studio.selectedComponent;
            if (hasSelection && !isInput()) {
                e.preventDefault();
                moveSelectedWithArrows(e.key, e.shiftKey ? 5 : 1);
            }
        }
    });
}

// ===============================================
// Undo/Redo System
// ===============================================
function pushHistory(action) {
    // Remove any redo history
    if (Studio.historyIndex < Studio.history.length - 1) {
        Studio.history = Studio.history.slice(0, Studio.historyIndex + 1);
    }

    // Add new action
    Studio.history.push(action);
    Studio.historyIndex = Studio.history.length - 1;

    // Limit history size
    if (Studio.history.length > Studio.maxHistory) {
        Studio.history.shift();
        Studio.historyIndex--;
    }

    updateUndoRedoUI();
}

async function undo() {
    if (Studio.historyIndex < 0) {
        log('info', 'Nothing to undo');
        return;
    }

    const action = Studio.history[Studio.historyIndex];
    Studio.historyIndex--;

    try {
        switch (action.type) {
            case 'place':
                // Undo place = remove
                await removeComponentById(action.instanceId);
                break;

            case 'move':
                // Undo move = move back
                await moveComponentTo(action.instanceId, action.oldGridX, action.oldGridY);
                break;

            case 'delete':
                // Undo delete = re-place (complex, may need server support)
                // For now, just log
                log('warning', 'Undo delete not fully supported yet');
                break;
        }
    } catch (error) {
        log('error', 'Undo failed');
    }

    updateUndoRedoUI();
}

async function redo() {
    if (Studio.historyIndex >= Studio.history.length - 1) {
        log('info', 'Nothing to redo');
        return;
    }

    Studio.historyIndex++;
    const action = Studio.history[Studio.historyIndex];

    try {
        switch (action.type) {
            case 'place':
                // Redo place = place again (would need full data)
                log('warning', 'Redo place not fully supported yet');
                break;

            case 'move':
                // Redo move = move forward
                await moveComponentTo(action.instanceId, action.newGridX, action.newGridY);
                log('info', 'Redo: Moved ' + action.name);
                break;

            case 'delete':
                // Redo delete = delete again
                await removeComponentById(action.instanceId);
                break;
        }
    } catch (error) {
        log('error', 'Redo failed');
    }

    updateUndoRedoUI();
}

async function moveComponentTo(instanceId, gridX, gridY) {
    const response = await fetch('/api/drone/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, gridX, gridY })
    });

    if (response.ok) {
        const el = document.getElementById('component-' + instanceId);
        if (el) {
            el.style.left = (gridX * Studio.gridCellSize) + 'px';
            el.style.top = (gridY * Studio.gridCellSize) + 'px';
        }

        const placed = Studio.placedComponents.find(c => c.instanceId === instanceId);
        if (placed) {
            placed.gridX = gridX;
            placed.gridY = gridY;
        }
    }
}

async function removeComponentById(instanceId) {
    const response = await fetch(`/api/drone/remove/${instanceId}`, { method: 'DELETE' });

    if (response.ok) {
        const el = document.getElementById('component-' + instanceId);
        if (el) el.remove();

        const hierarchyNode = document.querySelector(`[data-node-id="${instanceId}"]`);
        if (hierarchyNode) hierarchyNode.remove();

        if (window.threeScene) {
            window.threeScene.removeComponent(instanceId);
            if (window.dragInteraction && window.dragInteraction.transformControls.object?.userData?.id === instanceId) {
                window.dragInteraction.transformControls.detach();
                window.dragInteraction.highlightBox.visible = false;
            }
        }

        Studio.placedComponents = Studio.placedComponents.filter(c => c.instanceId !== instanceId);
        if (Studio.selectedComponent === instanceId) Studio.selectedComponent = null;
        updateComponentCount();
        updateMonitors();
    }
}

function updateUndoRedoUI() {
    // Could update menu items or toolbar buttons here
    // For now, we just track state
}

function moveSelectedWithArrows(key, step) {
    // Get list of components to move
    const toMove = Studio.selectedComponents.length > 0
        ? [...Studio.selectedComponents]
        : (Studio.selectedComponent ? [Studio.selectedComponent] : []);

    if (toMove.length === 0) return;

    // Calculate delta
    let deltaX = 0, deltaY = 0;
    switch (key) {
        case 'ArrowUp': deltaY = -step; break;
        case 'ArrowDown': deltaY = step; break;
        case 'ArrowLeft': deltaX = -step; break;
        case 'ArrowRight': deltaX = step; break;
    }

    // Track old positions for undo
    const moveInfo = [];

    // Update all selected components
    toMove.forEach(instanceId => {
        const el = document.getElementById('component-' + instanceId);
        const placed = Studio.placedComponents.find(c => c.instanceId === instanceId);

        if (el && placed) {
            const oldX = placed.gridX;
            const oldY = placed.gridY;
            const newX = Math.max(0, placed.gridX + deltaX);
            const newY = Math.max(0, placed.gridY + deltaY);

            // Update visual
            el.style.left = (newX * Studio.gridCellSize) + 'px';
            el.style.top = (newY * Studio.gridCellSize) + 'px';

            // Update state
            placed.gridX = newX;
            placed.gridY = newY;

            moveInfo.push({
                instanceId,
                name: placed.name,
                oldGridX: oldX,
                oldGridY: oldY,
                newGridX: newX,
                newGridY: newY
            });
        }
    });

    // Save to server (debounced)
    clearTimeout(Studio.arrowMoveTimeout);
    Studio.arrowMoveTimeout = setTimeout(async () => {
        // Update all on server
        for (const info of moveInfo) {
            await fetch('/api/drone/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId: info.instanceId,
                    gridX: info.newGridX,
                    gridY: info.newGridY
                })
            });
        }

        // Save to history
        if (moveInfo.length === 1) {
            pushHistory({
                type: 'move',
                ...moveInfo[0]
            });
        } else if (moveInfo.length > 1) {
            pushHistory({
                type: 'multi-move',
                components: moveInfo
            });
        }
    }, 300);
}

function isInput() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

// ===============================================
// Hierarchy
// ===============================================
function toggleNode(el) {
    el.classList.toggle('expanded');
    const children = el.closest('.hierarchy-node').querySelector('.hierarchy-children');
    if (children) {
        children.classList.toggle('collapsed');
        children.classList.toggle('expanded');
    }
}

function selectHierarchyNode(nodeId, event) {
    if (event) event.stopPropagation();
    if (nodeId === 'root') return;

    // Deselect all
    document.querySelectorAll('.hierarchy-node-content').forEach(el => {
        el.classList.remove('selected');
    });

    // Select this node
    const node = document.querySelector(`[data-node-id="${nodeId}"] > .hierarchy-node-content`);
    if (node) node.classList.add('selected');

    // Also select on canvas
    Studio.selectedComponent = nodeId;
    document.querySelectorAll('.placed-component').forEach(el => {
        el.classList.remove('selected');
    });
    const canvasEl = document.getElementById('component-' + nodeId);
    if (canvasEl) canvasEl.classList.add('selected');
}

async function deleteFromHierarchy(nodeId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    if (!nodeId || nodeId === 'root') return;

    try {
        const response = await fetch(`/api/drone/remove/${nodeId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Remove from canvas
            document.getElementById('component-' + nodeId)?.remove();

            // Remove from hierarchy tree
            const hierarchyNode = document.querySelector(`[data-node-id="${nodeId}"]`);
            if (hierarchyNode) hierarchyNode.remove();

            if (window.threeScene) {
                window.threeScene.removeComponent(nodeId);
                if (window.dragInteraction && window.dragInteraction.transformControls.object?.userData?.id === nodeId) {
                    window.dragInteraction.transformControls.detach();
                    window.dragInteraction.highlightBox.visible = false;
                }
            }

            // Update state
            Studio.placedComponents = Studio.placedComponents.filter(
                p => p.instanceId !== nodeId
            );

            if (Studio.selectedComponent === nodeId) {
                Studio.selectedComponent = null;
            }

            updateMonitors();
            updateComponentCount();
        } else {
            const err = await response.json();
            log('error', err.error || 'Failed to delete');
        }
    } catch (error) {
        log('error', 'Failed to delete: ' + error.message);
    }
}

async function refreshHierarchy() {
    try {
        const response = await fetch('/api/drone/hierarchy');
        const html = await response.text();
        // The API returns JSON, we need an HTML endpoint or rebuild in JS
    } catch (error) {
        log('error', 'Failed to refresh hierarchy');
    }
}

function addToHierarchy(instanceId, componentName, componentType, parentId = 'root') {
    let targetChildren;

    if (parentId && parentId !== 'root') {
        targetChildren = document.querySelector(`[data-node-id="${parentId}"] > .hierarchy-children`);
        if (!targetChildren) {
            // Create children container if not exists
            const parent = document.querySelector(`[data-node-id="${parentId}"]`);
            if (parent) {
                targetChildren = document.createElement('div');
                targetChildren.className = 'hierarchy-children expanded';
                parent.appendChild(targetChildren);
            }
        }
    }

    if (!targetChildren) {
        targetChildren = document.querySelector('[data-node-id="root"] > .hierarchy-children');

        // Create children container for root if not exists
        if (!targetChildren) {
            const root = document.querySelector('[data-node-id="root"]');
            if (root) {
                targetChildren = document.createElement('div');
                targetChildren.className = 'hierarchy-children expanded';
                root.appendChild(targetChildren);
            }
        }
    }

    if (!targetChildren) {
        console.error('Could not find hierarchy children container');
        return;
    }

    // Make sure container is expanded
    targetChildren.classList.remove('collapsed');
    targetChildren.classList.add('expanded');

    const nodeHtml = `
        <div class="hierarchy-node" data-node-id="${instanceId}" data-is-layer="false"
             ondragover="onHierarchyDragOver(event)"
             ondrop="onHierarchyDrop(event, '${instanceId}')">
            <div class="hierarchy-node-content" 
                 onclick="selectHierarchyNode('${instanceId}', event)"
                 draggable="true"
                 ondragstart="onHierarchyDragStart(event, '${instanceId}')">
                <span class="hierarchy-spacer"></span>
                <i class="bi bi-box"></i>
                <span class="hierarchy-name">${componentName}</span>
                <button class="hierarchy-delete-btn" onclick="deleteFromHierarchy('${instanceId}', event)" title="Delete component">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        </div>
    `;
    targetChildren.insertAdjacentHTML('beforeend', nodeHtml);
}

// ===============================================
// Layer Management
// ===============================================
let layerCounter = 1;

async function addNewLayer() {
    const name = prompt('Enter layer name:', `Layer ${layerCounter}`);
    if (!name) return;

    try {
        const response = await fetch('/api/drone/hierarchy/layer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, parentId: 'root' })
        });

        if (response.ok) {
            const layer = await response.json();
            addLayerToHierarchy(layer);
            layerCounter++;
        } else {
            log('error', 'Failed to create layer');
        }
    } catch (error) {
        log('error', 'Failed to create layer: ' + error.message);
    }
}

function addLayerToHierarchy(layer) {
    const rootChildren = document.querySelector('[data-node-id="root"] > .hierarchy-children');
    if (!rootChildren) {
        // Create children container if not exists
        const root = document.querySelector('[data-node-id="root"]');
        if (root) {
            const childDiv = document.createElement('div');
            childDiv.className = 'hierarchy-children expanded';
            root.appendChild(childDiv);
            addLayerToHierarchy(layer);
            return;
        }
        return;
    }

    rootChildren.classList.remove('collapsed');
    rootChildren.classList.add('expanded');

    const nodeHtml = `
        <div class="hierarchy-node is-layer has-children" data-node-id="${layer.id}" data-is-layer="true"
             ondragover="onHierarchyDragOver(event)"
             ondrop="onHierarchyDrop(event, '${layer.id}')">
            <div class="hierarchy-node-content" 
                 onclick="selectHierarchyNode('${layer.id}', event)"
                 draggable="true"
                 ondragstart="onHierarchyDragStart(event, '${layer.id}')">
                <span class="hierarchy-toggle expanded" onclick="toggleNode(this); event.stopPropagation();">
                    <i class="bi bi-chevron-right"></i>
                </span>
                <i class="bi bi-folder"></i>
                <span class="hierarchy-name">${layer.name}</span>
                <button class="hierarchy-delete-btn" onclick="deleteLayerFromHierarchy('${layer.id}', event)" title="Delete layer">
                    <i class="bi bi-x"></i>
                </button>
            </div>
            <div class="hierarchy-children expanded"></div>
        </div>
    `;
    rootChildren.insertAdjacentHTML('beforeend', nodeHtml);
}

async function deleteLayerFromHierarchy(layerId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    try {
        const response = await fetch(`/api/drone/hierarchy/layer/${layerId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Move children to parent and remove layer node
            const layerNode = document.querySelector(`[data-node-id="${layerId}"]`);
            if (layerNode) {
                const children = layerNode.querySelectorAll(':scope > .hierarchy-children > .hierarchy-node');
                const rootChildren = document.querySelector('[data-node-id="root"] > .hierarchy-children');

                children.forEach(child => {
                    rootChildren?.appendChild(child);
                });

                layerNode.remove();
            }
        }
    } catch (error) {
        log('error', 'Failed to delete layer');
    }
}

// ===============================================
// Hierarchy Drag & Drop
// ===============================================
let draggedHierarchyNodeId = null;

function onHierarchyDragStart(event, nodeId) {
    draggedHierarchyNodeId = nodeId;
    event.dataTransfer.setData('text/plain', nodeId);
    event.dataTransfer.effectAllowed = 'move';

    // Add visual feedback
    setTimeout(() => {
        event.target.closest('.hierarchy-node')?.classList.add('dragging');
    }, 0);
}

function onHierarchyDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const node = event.target.closest('.hierarchy-node');
    if (node) {
        // Only allow dropping on layers or root
        const isLayer = node.dataset.isLayer === 'true';
        const isRoot = node.dataset.nodeId === 'root';

        if (isLayer || isRoot) {
            document.querySelectorAll('.hierarchy-node.drag-over').forEach(n => n.classList.remove('drag-over'));
            node.classList.add('drag-over');
        }
    }
}

function onHierarchyDragEnd(event) {
    document.querySelectorAll('.hierarchy-node.dragging').forEach(n => n.classList.remove('dragging'));
    document.querySelectorAll('.hierarchy-node.drag-over').forEach(n => n.classList.remove('drag-over'));
    draggedHierarchyNodeId = null;
}

async function onHierarchyDrop(event, targetId) {
    event.preventDefault();
    event.stopPropagation();

    document.querySelectorAll('.hierarchy-node.drag-over').forEach(n => n.classList.remove('drag-over'));
    document.querySelectorAll('.hierarchy-node.dragging').forEach(n => n.classList.remove('dragging'));

    const nodeId = draggedHierarchyNodeId || event.dataTransfer.getData('text/plain');

    if (!nodeId || nodeId === targetId) return;

    // Don't allow dropping on itself or its children
    const targetNode = document.querySelector(`[data-node-id="${targetId}"]`);
    if (targetNode?.querySelector(`[data-node-id="${nodeId}"]`)) {
        log('warning', 'Cannot move to own child');
        return;
    }

    try {
        const response = await fetch('/api/drone/hierarchy/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: nodeId, newParentId: targetId })
        });

        if (response.ok) {
            // Move DOM element
            const draggedNode = document.querySelector(`[data-node-id="${nodeId}"]`);
            let targetChildren = document.querySelector(`[data-node-id="${targetId}"] > .hierarchy-children`);

            // Create children container if not exists
            if (!targetChildren) {
                const target = document.querySelector(`[data-node-id="${targetId}"]`);
                targetChildren = document.createElement('div');
                targetChildren.className = 'hierarchy-children expanded';
                target.appendChild(targetChildren);
            }

            if (draggedNode && targetChildren) {
                targetChildren.appendChild(draggedNode);
                targetChildren.classList.remove('collapsed');
                targetChildren.classList.add('expanded');
            }
        } else {
            log('error', 'Failed to move component');
        }
    } catch (error) {
        log('error', 'Failed to move: ' + error.message);
    }

    draggedHierarchyNodeId = null;
}

// ===============================================
// Project
// ===============================================
async function newProject() {
    if (confirm('Create new project? Unsaved changes will be lost.')) {
        await fetch('/api/drone/reset', { method: 'POST' });
        Studio.placedComponents = [];
        Studio.droppedBlocks = [];
        document.getElementById('gridOverlay').innerHTML = '';
        document.getElementById('codeWorkspaceInner').innerHTML = '';
        document.getElementById('codeEditor').value = '';

        // Clear hierarchy except root
        const rootChildren = document.querySelector('[data-node-id="root"] > .hierarchy-children');
        if (rootChildren) rootChildren.innerHTML = '';

        updateMonitors();
        updateComponentCount();
    }
}

// ===============================================
// Utilities
// ===============================================
function updateStatus(msg) {
    const el = document.getElementById('statusMessage');
    if (el) el.textContent = msg;
}

function updateComponentCount() {
    const el = document.getElementById('componentCount');
    if (el) el.textContent = `Components: ${Studio.placedComponents.length}`;
}

// ===============================================
// Global exports
// ===============================================
window.switchTab = switchTab;
window.selectCategory = selectCategory;
window.togglePlay = togglePlay;
window.playSimulation = playSimulation;
window.pauseSimulation = pauseSimulation;
window.stopSimulation = stopSimulation;
window.deleteSelected = deleteSelected;
window.duplicateSelected = duplicateSelected;
window.rotateSelected = rotateSelected;
window.newProject = newProject;
window.toggleNode = toggleNode;
window.selectHierarchyNode = selectHierarchyNode;
window.deleteFromHierarchy = deleteFromHierarchy;
window.addToHierarchy = addToHierarchy;
window.addNewLayer = addNewLayer;
window.deleteLayerFromHierarchy = deleteLayerFromHierarchy;
window.onHierarchyDragStart = onHierarchyDragStart;
window.onHierarchyDragOver = onHierarchyDragOver;
window.onHierarchyDrop = onHierarchyDrop;
window.clearConsole = clearConsole;
window.switchConsoleTab = switchConsoleTab;
