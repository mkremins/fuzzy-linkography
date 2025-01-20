let linkographData = null;
let fileSelect;

// Constants from app.js
const GRAPH_WIDTH = 1000;
const INIT_X = 10;
const INIT_Y = 500;
const MOVE_LINK_BAR_HEIGHT = 40;
const MIN_LINK_STRENGTH = 0.35;

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
        redraw();
    } catch (error) {
        console.error('Error loading file:', error);
    }
}

// P5.js setup and event handlers
window.onload = () => {
    loadAvailableFiles();
    
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
    
    // Draw timeline dividers first
    drawTimelineDividers();
    
    // Draw connections
    drawConnections();
    
    // Draw moves last (so they appear on top)
    drawMoves();
}

function drawTimelineDividers() {
    if (!linkographData.moves) return;
    
    stroke(153); // #999
    strokeWeight(1);
    drawingContext.setLineDash([2]);
    
    for (let i = 0; i < linkographData.moves.length - 1; i++) {
        const currMove = linkographData.moves[i];
        const nextMove = linkographData.moves[i + 1];
        if (!currMove.timestamp || !nextMove.timestamp) continue;
        
        const x = currMove.position.x + (linkographData.metadata.moveSpacing / 2);
        line(x, INIT_Y - INIT_Y/2, x, INIT_Y + INIT_Y/2);
    }
    
    drawingContext.setLineDash([]); // Reset dash pattern
}

function drawConnections() {
    if (!linkographData.connections) return;
    
    // Sort connections by strength (weaker first)
    const sortedConnections = [...linkographData.connections]
        .sort((a, b) => a.strength - b.strength);
    
    for (const conn of sortedConnections) {
        const strength = conn.strength;
        if (strength < MIN_LINK_STRENGTH) continue;
        
        // Calculate joint position (elbow)
        const jointX = (conn.fromPos.x + conn.toPos.x) / 2;
        const jointY = conn.fromPos.y - ((conn.toPos.x - conn.fromPos.x) / 2);
        
        // Map strength to visual properties
        const alpha = map(strength, MIN_LINK_STRENGTH, 1, 50, 255);
        const weight = map(strength, MIN_LINK_STRENGTH, 1, 1, 2);
        
        // Draw connection lines
        stroke(0, alpha);
        strokeWeight(weight);
        
        // Draw two lines forming right angle
        line(conn.fromPos.x, conn.fromPos.y, jointX, jointY);
        line(conn.toPos.x, conn.toPos.y, jointX, jointY);
        
        // Draw joint point
        noStroke();
        fill(0, alpha);
        circle(jointX, jointY, 3);
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
                MOVE_LINK_BAR_HEIGHT
            );
            noStroke();
            fill('#998ec3');
            rect(x - 5, y - 10 - barHeight, 5, barHeight);
        }
        
        if (move.forelinkIndex) {
            const barHeight = map(
                move.forelinkIndex,
                0,
                linkographData.metadata.maxForelinkIndex,
                0,
                MOVE_LINK_BAR_HEIGHT
            );
            noStroke();
            fill('#f1a340');
            rect(x, y - 10 - barHeight, 5, barHeight);
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
        translate(x + 5, y - MOVE_LINK_BAR_HEIGHT - 20);
        rotate(-90);
        text(move.text, 0, 0);
        pop();
    }
}

function windowResized() {
    resizeCanvas(GRAPH_WIDTH, GRAPH_WIDTH/2 + INIT_Y);
    redraw();
} 