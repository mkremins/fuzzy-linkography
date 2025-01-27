let linkographData = null;
let fileSelect;
let pane;
let PARAMS = {
    // Visualization Parameters
    //graphWidth: 1000,
    //initX: 10,
    //initY: 500,
    moveLinkBarHeight: 40,
    moveDistance: 5,
    moveBarDistance: 5,
    
    // Link Parameters
    minLinkStrength: 0.35,
    leafThreshold: 0.7,
    leafZone: 0.3,
    minLeafCount: 2,
    maxLeafCount: 8,
    
    // Style Parameters
    baseWeightMin: 2,
    baseWeightMax: 6,
    leafSizeMin: 5,
    leafSizeMax: 10,
    leafDensity: 0.1,
    leafAngleRange: 60,
    
    // Color Parameters
    leafColorLeft: {
        color: { r: 80, g: 120, b: 40 },
        variance: 20,
        alpha: 200
    },
    leafColorRight: {
        color: { r: 120, g: 80, b: 40 },
        variance: 20,
        alpha: 200
    },
    
    // Add new leaf angle parameters
    leafBaseAngle: 45,  // Base angle for leaf growth
    leafAngleVariance: 15,  // How much the angle can vary
    showLeaves: true,  // default to show leaves
    
    // Leaf Density Range
    leafDensityMin: 0.5,  // minimum density multiplier
    leafDensityMax: 2.0,  // maximum density multiplier
    
    // Add branch layer control
    branchesOnTop: false, // Default: branches behind leaves
    
    // Add opacity range parameters for links
    linkAlphaMin: 50,   // Default minimum opacity
    linkAlphaMax: 255,  // Default maximum opacity
};

// Constants from app.js
const GRAPH_WIDTH = 1000;
const INIT_X = 10;
const INIT_Y = 500;
const MOVE_LINK_BAR_HEIGHT = 40;
const MIN_LINK_STRENGTH = 0.35;
const LEAF_THRESHOLD = 0.7;  // only connections stronger than this will grow leaves
const LEAF_ZONE = 0.3;      // only the last parts of the branch can grow leaves
const LEAF_COUNT_RANGE = [2, 8];  // range of leaf count, mapped by strength

const SEGMENT_THRESHOLD = 1000 * 60 * 30; // 30 mins -> milliseconds

// File handling
async function loadAvailableFiles() {
    try {
        // Fetch the list of files from the directory
        const response = await fetch('/api/list-files');
        const files = await response.json();
        
        // Get the select element
        fileSelect = document.getElementById('fileSelect');
        
        // Add options for each file
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file.replace('.json', '').replace('linkograph_', '');
            fileSelect.appendChild(option);
        });
        
        // Load last selected file from localStorage
        const lastSelected = localStorage.getItem('lastSelectedFile');
        if (lastSelected && files.includes(lastSelected)) {
            fileSelect.value = lastSelected;
            loadFile(lastSelected);
        }
    } catch (error) {
        console.error('Error loading file list:', error);
    }
}

async function loadFile(filename) {
    try {
        const response = await fetch(`/linkograph_data/${filename}`);
        linkographData = await response.json();
        // Save selection to localStorage
        localStorage.setItem('lastSelectedFile', filename);
        
        // Start animation after loading new data
        startAnimation();
        redraw();
    } catch (error) {
        console.error('Error loading file:', error);
    }
}

// P5.js setup and event handlers
window.onload = () => {
    loadAvailableFiles();
    setupTweakpane();
    
    document.getElementById('fileSelect').addEventListener('change', (event) => {
        if (event.target.value) {
            loadFile(event.target.value);
        }
    });
}

function setup() {
    createCanvas(GRAPH_WIDTH, GRAPH_WIDTH/2 + INIT_Y);
    angleMode(DEGREES);
    noLoop();
}

function draw() {
    if (!linkographData) {
        background(255);
        fill(100);
        noStroke();
        textAlign(CENTER, CENTER);
        text('Please load a linkograph JSON file', width/2, height/2);
        return;
    }

    background(255);
    
    // timeline dividers 
    drawTimelineDividers();
    
    // Draw connections
    drawConnections();
    
    // Draw moves last (so they appear on top)
    drawMoves();
}

function shouldSegmentTimeline(currMove, prevMove) {
    if (!(currMove?.timestamp && prevMove?.timestamp)) return false
    const deltaTime = Date.parse(currMove.timestamp) - Date.parse(prevMove.timestamp)
    return deltaTime >= SEGMENT_THRESHOLD
}

function drawTimelineDividers() {
    if (!linkographData.moves) return
    
    stroke(153) // #999
    strokeWeight(1)
    drawingContext.setLineDash([2])
    
    for (let i = 0; i < linkographData.moves.length - 1; i++) {
        const currMove = linkographData.moves[i]
        const nextMove = linkographData.moves[i + 1]
        
        // show timeline based on threshold
        if (!shouldSegmentTimeline(nextMove, currMove)) continue
        
        const x = currMove.position.x + (linkographData.metadata.moveSpacing / 2)
        line(x, INIT_Y - INIT_Y/2, x, INIT_Y + INIT_Y/2)
    }
    
    drawingContext.setLineDash([]) // Reset dash pattern
}

function drawLeaf(x, y, size, angle, isLeft) {
    push();
    translate(x, y);
    rotate(angle);
    
    const leafColor = isLeft ? PARAMS.leafColorLeft : PARAMS.leafColorRight;
    const { color, variance, alpha } = leafColor;
    const randomR = color.r + random(-variance, variance);
    const randomG = color.g + random(-variance, variance);
    const randomB = color.b + random(-variance, variance);
    
    fill(randomR, randomG, randomB, alpha);
    noStroke();
    
    // Move the leaf origin to the branch edge
    translate(0, -strokeWeight() / 2);  // Move origin to branch edge
    
    beginShape();
    // Draw leaf shape starting from the branch
    vertex(0, 0);  // Start at branch connection point
    
    // Draw the leaf outline
    for (let i = -45; i <= 45; i++) {
        const rad = size * (1 - abs(i) / 90);  // Taper the leaf
        const leafX = rad * cos(i);
        const leafY = -rad * sin(i);  // Negative to grow outward
        vertex(leafX, leafY);
    }
    
    endShape(CLOSE);
    pop();
}

function drawBranch(startX, startY, endX, endY, baseWeight, strength, isFromJoint, moveData, leavesOnly = false) {
    const branchAngle = atan2(endY - startY, endX - startX);
    
    for (let t = 0; t <= 1; t += 0.02) {
        const x1 = lerp(startX, endX, t);
        const y1 = lerp(startY, endY, t);
        const x2 = lerp(startX, endX, t + 0.02);
        const y2 = lerp(startY, endY, t + 0.02);
        
        // Only draw branches in non-leavesOnly mode
        if (!leavesOnly) {
            const weight = map(t, 0, 1, baseWeight * 2.5, baseWeight * 0.3);
            strokeWeight(weight);
            line(x1, y1, x2, y2);
        }
        
        // Only draw leaves under appropriate conditions
        if (strength >= PARAMS.leafThreshold && 
            t > 1 - PARAMS.leafZone && 
            PARAMS.showLeaves &&
            (leavesOnly || !PARAMS.branchesOnTop)) {
            
            const isLeft = random() < 0.5;
            
            // density calculation
            let densityMultiplier = 1;
            if (moveData) {
                const linkIndex = isLeft ? moveData.backlinkIndex : moveData.forelinkIndex;
                const maxIndex = isLeft ? 
                    linkographData.metadata.maxBacklinkIndex : 
                    linkographData.metadata.maxForelinkIndex;
                
                densityMultiplier = map(linkIndex, 0, maxIndex, 
                    PARAMS.leafDensityMin, 
                    PARAMS.leafDensityMax
                );
            }
            
            // apply density
            if (random() < PARAMS.leafDensity * densityMultiplier) {
                const leafSize = map(strength, PARAMS.leafThreshold, 1, 
                    PARAMS.leafSizeMin, PARAMS.leafSizeMax);
                const leafAngle = branchAngle + 
                    (isLeft ? 45 : -45) +
                    random(-PARAMS.leafAngleRange/4, PARAMS.leafAngleRange/4);
                
                drawLeaf(x1, y1, leafSize, leafAngle, isLeft);
            }
        }
    }
}

function drawConnections() {
    if (!linkographData.connections) return;
    
    // Fix random seed
    const seed = linkographData.connections.length;
    randomSeed(seed);
    
    const sortedConnections = [...linkographData.connections]
        .sort((a, b) => a.strength - b.strength);
    
    if (PARAMS.branchesOnTop) {
        // Draw leaves first
        drawConnectionLeaves(sortedConnections);
        // Then draw branches
        drawConnectionBranches(sortedConnections);
    } else {
        // Draw in original order
        drawConnectionBranches(sortedConnections);
    }
}

// Function to draw only leaves
function drawConnectionLeaves(connections) {
    for (const conn of connections) {
        const strength = conn.strength;
        if (strength < PARAMS.minLinkStrength) continue;
        
        const jointX = (conn.fromPos.x + conn.toPos.x) / 2;
        const jointY = conn.fromPos.y + ((conn.toPos.x - conn.fromPos.x) / 2);
        
        const alpha = map(strength, PARAMS.minLinkStrength, 1, 50, 255);
        const baseWeight = map(strength, PARAMS.minLinkStrength, 1, 
            PARAMS.baseWeightMin, PARAMS.baseWeightMax);
            
        // Get move data
        const fromMove = linkographData.moves[conn.from];
        const toMove = linkographData.moves[conn.to];
        
        // Draw only leaves, no branches
        drawBranch(jointX, jointY, conn.fromPos.x, conn.fromPos.y, baseWeight, strength, true, fromMove, true);
        drawBranch(jointX, jointY, conn.toPos.x, conn.toPos.y, baseWeight, strength, true, toMove, true);
    }
}

// Function to draw only branches
function drawConnectionBranches(connections) {
    for (const conn of connections) {
        const strength = conn.strength;
        if (strength < PARAMS.minLinkStrength) continue;
        
        const jointX = (conn.fromPos.x + conn.toPos.x) / 2;
        const jointY = conn.fromPos.y + ((conn.toPos.x - conn.fromPos.x) / 2);
        
        // Use parameterized opacity range
        const alpha = map(strength, PARAMS.minLinkStrength, 1, 
            PARAMS.linkAlphaMin, PARAMS.linkAlphaMax);
        
        const baseWeight = map(strength, PARAMS.minLinkStrength, 1, 
            PARAMS.baseWeightMin, PARAMS.baseWeightMax);
        
        stroke(0, alpha);
        
        const fromMove = linkographData.moves[conn.from];
        const toMove = linkographData.moves[conn.to];
        
        // Draw only branches, no leaves
        drawBranch(jointX, jointY, conn.fromPos.x, conn.fromPos.y, baseWeight, strength, true, fromMove, false);
        drawBranch(jointX, jointY, conn.toPos.x, conn.toPos.y, baseWeight, strength, true, toMove, false);
        
        // Draw connection point
        noStroke();
        fill(0, alpha);
        circle(jointX, jointY, baseWeight * 2.5);
    }
}

function drawMoves() {
    if (!linkographData.moves) return;
    
    for (const move of linkographData.moves) {
        const x = move.position.x;
        const y = move.position.y;
        
        // Draw backlink/forelink bars
        if (move.backlinkIndex) {
            const barHeight = map(
                move.backlinkIndex,
                0,
                linkographData.metadata.maxBacklinkIndex,
                0,
                PARAMS.moveLinkBarHeight
            );
            noStroke();
            const leftColor = PARAMS.leafColorLeft.color;
            fill(leftColor.r, leftColor.g, leftColor.b);  
            rect(x - 5, y - 10 - barHeight - PARAMS.moveBarDistance, 5, barHeight);
        }
        
        if (move.forelinkIndex) {
            const barHeight = map(
                move.forelinkIndex,
                0,
                linkographData.metadata.maxForelinkIndex,
                0,
                PARAMS.moveLinkBarHeight
            );
            noStroke();
            const rightColor = PARAMS.leafColorRight.color;
            fill(rightColor.r, rightColor.g, rightColor.b);   
            rect(x, y - 10 - barHeight - PARAMS.moveBarDistance, 5, barHeight);
        }
        
        // Draw move point
        noStroke();
        fill(0);
        circle(x, y, 10);
        
        // Draw move text
        fill(0);
        textSize(12);
        textAlign(LEFT, CENTER);
        push();
        translate(x + 5, y - PARAMS.moveLinkBarHeight - PARAMS.moveDistance -  PARAMS.moveBarDistance -10);
        rotate(-90);
        text(move.text, 0, 0);
        pop();
    }
}

function windowResized() {
    resizeCanvas(GRAPH_WIDTH, GRAPH_WIDTH/2 + INIT_Y);
    redraw();
}

function setupTweakpane() {
    pane = new Tweakpane.Pane();
    
    // Load saved parameters if they exist
    const savedParams = localStorage.getItem('linkographParams');
    if (savedParams) {
        // Ensure merge instead of replacing the entire object
        const loadedParams = JSON.parse(savedParams);
        PARAMS = {
            ...PARAMS,  // Keep default values
            ...loadedParams,  // Override with saved values
            leafColorLeft: {
                ...PARAMS.leafColorLeft,
                ...(loadedParams.leafColorLeft || {}),
                color: {
                    ...(PARAMS.leafColorLeft.color),
                    ...(loadedParams.leafColorLeft?.color || {})
                }
            },
            leafColorRight: {
                ...PARAMS.leafColorRight,
                ...(loadedParams.leafColorRight || {}),
                color: {
                    ...(PARAMS.leafColorRight.color),
                    ...(loadedParams.leafColorRight?.color || {})
                }
            }
        };
    }
    
    // Visualization folder
    const vizFolder = pane.addFolder({ title: 'Visualization' });
    //vizFolder.addInput(PARAMS, 'graphWidth', { min: 500, max: 2000 });
    //vizFolder.addInput(PARAMS, 'initX', { min: 0, max: 50 });
    //vizFolder.addInput(PARAMS, 'initY', { min: 100, max: 1000 });
    vizFolder.addInput(PARAMS, 'moveLinkBarHeight', { min: 20, max: 100 });
    vizFolder.addInput(PARAMS, 'moveDistance', { min: 1, max: 60 });
    vizFolder.addInput(PARAMS, 'moveBarDistance', { min: 1, max: 60 });
    // Link folder
    const linkFolder = pane.addFolder({ title: 'Links' });
    linkFolder.addInput(PARAMS, 'minLinkStrength', { min: 0, max: 1 });
    linkFolder.addInput(PARAMS, 'leafThreshold', { min: 0, max: 1 });
    linkFolder.addInput(PARAMS, 'leafZone', { min: 0, max: 1 });
    linkFolder.addInput(PARAMS, 'minLeafCount', { min: 1, max: 10, step: 1 });
    linkFolder.addInput(PARAMS, 'maxLeafCount', { min: 1, max: 20, step: 1 });
    
    // Style folder
    const styleFolder = pane.addFolder({ title: 'Style' });
    styleFolder.addInput(PARAMS, 'baseWeightMin', { min: 1, max: 10 });
    styleFolder.addInput(PARAMS, 'baseWeightMax', { min: 1, max: 20 });
    styleFolder.addInput(PARAMS, 'leafSizeMin', { min: 1, max: 40 });
    styleFolder.addInput(PARAMS, 'leafSizeMax', { min: 1, max: 60 });
    styleFolder.addInput(PARAMS, 'leafDensity', { min: 0, max: 1 });
    styleFolder.addInput(PARAMS, 'leafAngleRange', { min: 0, max: 90 });
    styleFolder.addInput(PARAMS, 'showLeaves', {
        label: 'Show Leaves'
    });
    
    // Add branch layer control to Style folder
    styleFolder.addInput(PARAMS, 'branchesOnTop', {
        label: 'Branches On Top'
    });
    
    // Leaf Angle folder
    const leafAngleFolder = pane.addFolder({ title: 'Leaf Angles' });
    leafAngleFolder.addInput(PARAMS, 'leafBaseAngle', { min: 0, max: 90 });
    leafAngleFolder.addInput(PARAMS, 'leafAngleVariance', { min: 0, max: 45 });
    
    // Left Leaf Color folder
    const leftColorFolder = pane.addFolder({ title: 'Left Leaf Color' });
    leftColorFolder.addInput(PARAMS.leafColorLeft, 'color', { 
        view: 'color',
        label: 'Color'
    });
    leftColorFolder.addInput(PARAMS.leafColorLeft, 'variance', { min: 0, max: 50 });
    leftColorFolder.addInput(PARAMS.leafColorLeft, 'alpha', { min: 0, max: 255 });
    
    // Right Leaf Color folder
    const rightColorFolder = pane.addFolder({ title: 'Right Leaf Color' });
    rightColorFolder.addInput(PARAMS.leafColorRight, 'color', { 
        view: 'color',
        label: 'Color'
    });
    rightColorFolder.addInput(PARAMS.leafColorRight, 'variance', { min: 0, max: 50 });
    rightColorFolder.addInput(PARAMS.leafColorRight, 'alpha', { min: 0, max: 255 });
    
    // leaf density folder
    const densityFolder = pane.addFolder({ title: 'Leaf Density' });
    densityFolder.addInput(PARAMS, 'leafDensityMin', {
        min: 0,
        max: 1,
        step: 0.1,
        label: 'Min Multiplier'
    });
    densityFolder.addInput(PARAMS, 'leafDensityMax', {
        min: 1,
        max: 4,
        step: 0.1,
        label: 'Max Multiplier'
    });
    
    // Animation Controls
    const animFolder = pane.addFolder({ title: 'Animation' });
    animFolder.addInput(ANIMATION_CONFIG, 'duration', {
        min: 0,
        max: 3000,
        step: 100,
        label: 'Duration (ms)'
    });
    
    animFolder.addButton({ title: 'Play Animation' })
        .on('click', () => {
            startAnimation();
        });
    
    // Save button
    pane.addButton({ title: 'Save Settings' }).on('click', () => {
        localStorage.setItem('linkographParams', JSON.stringify(PARAMS));
    });
    
    // Reset button
    pane.addButton({ title: 'Reset to Defaults' }).on('click', () => {
        localStorage.removeItem('linkographParams');
        location.reload();
    });
    
    // Trigger redraw on any parameter change
    pane.on('change', () => {
        redraw();
    });
    
    // Add opacity controls to Links folder
    linkFolder.addInput(PARAMS, 'linkAlphaMin', {
        label: 'Min Opacity',
        min: 0,
        max: 255,
        step: 1
    });
    
    linkFolder.addInput(PARAMS, 'linkAlphaMax', {
        label: 'Max Opacity',
        min: 0,
        max: 255,
        step: 1
    });
}

const ANIMATION_CONFIG = {
    duration: 500,  // Animation duration in milliseconds
    isPlaying: false,
    startTime: 0,
    // Define parameters to animate
    targets: [
        {
            param: 'baseWeightMax',     // Parameter name in PARAMS
            startValue: 0,            // Initial value
            endValue: null,           // null means use current value
        },
 
        {
            param: 'leafSizeMin',     // Parameter name in PARAMS
            startValue: 0,            // Initial value
            endValue: null,           // null means use current value
        },
        {
            param: 'leafSizeMax',     // Parameter name in PARAMS
            startValue: 0,            // Initial value
            endValue: null,           // null means use current value
        },
        {
            param: 'leafAngleRange',     // Parameter name in PARAMS
            startValue: 0,            // Initial value
            endValue: null,           // null means use current value
        },
        {
            param: 'linkAlphaMax',     // Parameter name in PARAMS
            startValue: 0,            // Initial value
            endValue: null,           // null means use current value
        },
        // Add more parameters as needed
    ]
};

function startAnimation() {
    // Save target values
    ANIMATION_CONFIG.targets.forEach(target => {
        target.endValue = PARAMS[target.param];
        PARAMS[target.param] = target.startValue;
    });
    
    ANIMATION_CONFIG.isPlaying = true;
    ANIMATION_CONFIG.startTime = Date.now();
    requestAnimationFrame(updateAnimation);
}

function updateAnimation() {
    if (!ANIMATION_CONFIG.isPlaying) return;
    
    const currentTime = Date.now();
    const elapsed = currentTime - ANIMATION_CONFIG.startTime;
    const progress = Math.min(elapsed / ANIMATION_CONFIG.duration, 1);
    
    // Update each target parameter
    ANIMATION_CONFIG.targets.forEach(target => {
        PARAMS[target.param] = lerp(
            target.startValue,
            target.endValue,
            progress
        );
    });
    
    redraw();  // Redraw the scene
    
    if (progress < 1) {
        requestAnimationFrame(updateAnimation);
    } else {
        ANIMATION_CONFIG.isPlaying = false;
    }
}

// Helper function
function lerp(start, end, t) {
    return start + (end - start) * t;
} 