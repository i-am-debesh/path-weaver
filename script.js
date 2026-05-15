if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered!'))
      .catch(err => console.error('Service Worker failed:', err));
  });
}
//bg music functions:::

const music = document.getElementById('bgMusic');
music.play();
music.loop = true;
// --- 1. PERSISTENCE & STATE ---
let currentLevel = parseInt(localStorage.getItem('pathWeaverLevel')) || 1;
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';

let dots = [];
let paths = [];
let currentPath = [];
let isDrawing = false;
let startDot = null;
let isplaying = true;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const levelNumEl = document.getElementById('level-num');
const ALL_COLORS = ['#00f2ff', '#ff4757', '#2ed573', '#ffa502', '#eccc68', '#a29bfe', '#fd79a8', '#7bed9f'];

// --- 2. AUDIO ENGINE (Web Audio API) ---
const AudioEngine = {
    ctx: null,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    playTone(freq, type, duration) {
        if (!soundEnabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    },
    success() { this.playTone(523, 'sine', 0.4); setTimeout(() => this.playTone(659, 'sine', 0.4), 100); },
    error() { this.playTone(120, 'sawtooth', 0.3); },
    win() { this.playTone(523, 'triangle', 0.3); setTimeout(() => this.playTone(880, 'triangle', 0.5), 150); }
};

// --- 3. UI & NAVIGATION ---
function updateHomeUI() {
    const info = document.getElementById('save-info');
    info.innerHTML = currentLevel > 1 ? `RESUMING: LEVEL ${currentLevel}` : "NEW MISSION DETECTED";
    document.getElementById('sound-icon').innerText = soundEnabled ? "🔊" : "🔇";
}

function showHome() {
    // Hide the game board
    document.getElementById('game-screen').style.display = 'none';
    // Show the landing page
    document.getElementById('home-screen').style.display = 'flex';
    // Refresh the level text (e.g., "Resuming Level X")
    updateHomeUI();
}

function startGame() {
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    initGame();
}

function customAlert(title, msg, type) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerText = msg;
    const modal = document.getElementById('game-modal');
    modal.style.display = 'flex';
    modal.dataset.action = type; // 'reset' or 'next'
}

function closeModal() {
    const modal = document.getElementById('game-modal');
    modal.style.display = 'none';
    if (modal.dataset.action === 'reset') loadLevel(currentLevel);
    if (modal.dataset.action === 'next') loadLevel(currentLevel);
}

// --- 4. GAME CORE ---
function initGame() {
    loadLevel(currentLevel);
    canvas.addEventListener('pointerdown', e => {
        const pos = getCoords(e);
        const hit = dots.find(d => !d.connected && Math.hypot(d.x - pos.x, d.y - pos.y) < 40);
        if (hit) { isDrawing = true; startDot = hit; currentPath = [pos]; }
    });
    canvas.addEventListener('pointermove', e => {
        if (!isDrawing) return;
        const pos = getCoords(e);
        currentPath.push(pos);
        if (checkCollision(currentPath)) {
            isDrawing = false;
            AudioEngine.error();
            customAlert("COLLISION", "Paths crossed or obstacle hit!", "reset");
        }
        draw();
    });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('resize', () => {
    if (document.getElementById('game-screen').style.display !== 'none') {
        loadLevel(currentLevel);
    }
});
}

function handleEnd(e) {
    if (!isDrawing) return;
    const pos = getCoords(e);
    // FIX: Defining endDot clearly before usage
    const endDot = dots.find(d => d !== startDot && !d.connected && Math.hypot(d.x - pos.x, d.y - pos.y) < 50);

    if (endDot && endDot.color === startDot.color) {
        currentPath[currentPath.length - 1] = { x: endDot.x, y: endDot.y };
        paths.push({ color: startDot.color, points: [...currentPath] });
        startDot.connected = true;
        endDot.connected = true;
        AudioEngine.success();
        const dotScale = { val: 1 };
        const animateSnap = () => {
            dotScale.val += 0.1;
            if (dotScale.val < 1.5) {
                // Draw a quick pulse effect
                ctx.beginPath();
                ctx.arc(endDot.x, endDot.y, 22 * dotScale.val, 0, Math.PI*2);
                ctx.strokeStyle = endDot.color;
                ctx.lineWidth = 2;
                ctx.stroke();
                requestAnimationFrame(animateSnap);
            }
        };
        animateSnap();
        
        if (dots.every(d => d.connected)) {
            AudioEngine.win();
            currentLevel++;
            localStorage.setItem('pathWeaverLevel', currentLevel);
            customAlert("GRID SYNCED", `Level ${currentLevel-1} Complete.`, "next");
        }
    }
    isDrawing = false;
    startDot = null;
    draw();
}

// --- 5. LOGIC & MATH ---
function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}


function genValidLevel(level) {
    const rect = canvas.getBoundingClientRect();
    let attempts = 0;
    let success = false;

    while (!success && attempts < 10) {
        dots = [];
        obstacles = [];
        const pairCount = Math.min(3 + Math.floor(level / 4), 10);
        const obstacleCount = level >= 5 ? Math.min(Math.floor(level / 5), 5) : 0;
        const colors = [...ALL_COLORS].sort(() => Math.random() - 0.5);

        // 1. Place Obstacles
        for (let i = 0; i < obstacleCount; i++) {
            obstacles.push(genPos(rect.width, rect.height, [...dots, ...obstacles]));
        }

        // 2. Place Pairs & Validate
        let allPairsValid = true;
        for (let i = 0; i < pairCount; i++) {
            let p1 = genPos(rect.width, rect.height, [...dots, ...obstacles]);
            let p2 = genPos(rect.width, rect.height, [...dots, ...obstacles, p1]);
            
            // LOGIC CHECK: Is there at least one way to connect these?
            if (!isPathPossible(p1, p2, [...dots, ...obstacles])) {
                allPairsValid = false;
                break; 
            }
            dots.push({...p1, color: colors[i % colors.length], connected: false});
            dots.push({...p2, color: colors[i % colors.length], connected: false});
        }

        if (allPairsValid) success = true;
        attempts++;
    }
    draw();
}

function isPathPossible(p1, p2, blockers) {
    const grid = 25; // Check connectivity on a 25px simplified grid
    const w = Math.ceil(canvas.width / (window.devicePixelRatio || 1) / grid);
    const h = Math.ceil(canvas.height / (window.devicePixelRatio || 1) / grid);
    
    const start = {x: Math.floor(p1.x/grid), y: Math.floor(p1.y/grid)};
    const end = {x: Math.floor(p2.x/grid), y: Math.floor(p2.y/grid)};
    
    let queue = [start];
    let visited = new Set([`${start.x},${start.y}`]);

    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr.x === end.x && curr.y === end.y) return true;

        [[0,1],[1,0],[0,-1],[-1,0]].forEach(([dx, dy]) => {
            let next = {x: curr.x + dx, y: curr.y + dy};
            let key = `${next.x},${next.y}`;
            
            if (next.x >= 0 && next.x < w && next.y >= 0 && next.y < h && !visited.has(key)) {
                let rx = next.x * grid, ry = next.y * grid;
                let blocked = blockers.some(b => Math.hypot(b.x - rx, b.y - ry) < 35);
                if (!blocked) {
                    visited.add(key);
                    queue.push(next);
                }
            }
        });
    }
    return false;
}

function loadLevel(level) {
    // 1. UI & Safety Reset
    const boundary = document.getElementById('canvas-boundary');
    const levelNumEl = document.getElementById('level-num');
    
    if (!boundary) return; // Stop if HTML isn't ready
    if (levelNumEl) levelNumEl.innerText = level;

    // 2. High-DPI Canvas Scaling
    const rect = boundary.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Normalize coordinate system

    // 3. Game State Reset
    paths = [];
    dots = [];
    obstacles = [];
    currentPath = [];
    isDrawing = false;

    // 4. Difficulty Scaling (Infinite Logic)
    // Max 8 pairs to prevent overlapping, max 6 obstacles
    const pairCount = Math.min(3 + Math.floor(level / 5), 8);
    const obstacleCount = level >= 5 ? Math.min(Math.floor(level / 8), 6) : 0;
    const colors = [...ALL_COLORS].sort(() => Math.random() - 0.5);

    // 5. Validation Loop (Ensures level is physically possible)
    let mapValid = false;
    let mapAttempts = 0;

    while (!mapValid && mapAttempts < 20) {
        dots = [];
        obstacles = [];
        let success = true;

        // Place Obstacles first
        for (let i = 0; i < obstacleCount; i++) {
            obstacles.push(genPos(rect.width, rect.height, [...dots, ...obstacles]));
        }

        // Place Pairs
        for (let i = 0; i < pairCount; i++) {
            const color = colors[i % colors.length];
            const p1 = genPos(rect.width, rect.height, [...dots, ...obstacles]);
            const p2 = genPos(rect.width, rect.height, [...dots, ...obstacles, p1]);

            // BFS Check: Is there a theoretical path?
            if (!isPathPossible(p1, p2, [...dots, ...obstacles])) {
                success = false;
                break;
            }

            dots.push({ ...p1, color, connected: false });
            dots.push({ ...p2, color, connected: false });
        }

        if (success) {
            mapValid = true;
        } else {
            mapAttempts++;
        }
    }

    // 6. Update UI and Final Render
    if (typeof updateProgress === "function") updateProgress();
    draw();
}
function genPos(w, h, existing) {
    let x, y, tooClose;
    let attempts = 0;
    let minDistance = 80; // Start with wide spacing
    const margin = 40;

    while (attempts < 500) {
        tooClose = false;
        x = margin + Math.random() * (w - margin * 2);
        y = margin + Math.random() * (h - margin * 2);

        for (let e of existing) {
            if (Math.hypot(e.x - x, e.y - y) < minDistance) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) return { x, y };

        attempts++;
        // Loosen spacing every 50 attempts to ensure we find a spot
        if (attempts % 50 === 0 && minDistance > 45) minDistance -= 5;
    }
    return { x, y }; // Final fallback
}
function checkCollision(path) {
    if (path.length < 2) return false;
    const p1 = path[path.length - 2];
    const p2 = path[path.length - 1];

    // Check collisions with other paths
    for (let p of paths) {
        for (let i = 0; i < p.points.length - 1; i++) {
            if (intersect(p1, p2, p.points[i], p.points[i+1])) return true;
        }
    }

    // Check collisions with OBSTACLES (The new challenge)
    for (let obs of obstacles) {
        if (distToSeg(obs, p1, p2) < 18) return true;
    }

    // Check collisions with other dots
    for (let d of dots) {
        if (d === startDot) continue;
        if (distToSeg(d, p1, p2) < 15) {
            // Allow touching the target dot only
            if (!(d.color === startDot.color && !d.connected)) return true;
        }
    }
    return false;
}

function intersect(p1, p2, p3, p4) {
    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
    if (det === 0) return false;
    const l = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
    const g = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
    return (0.05 < l && l < 0.95) && (0.05 < g && g < 0.95);
}

function distToSeg(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 == 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}
// This function draws a smooth 'ribbon' instead of a jagged line
function drawSmoothPath(points, color, width) {
    if (points.length < 3) {
        // If we only have 2 points, just draw a straight line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.moveTo(points[0].x, points[0].y);
        if(points[1]) ctx.lineTo(points[1].x, points[1].y);
        ctx.stroke();
        return;
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round"; // Round ends
    ctx.lineJoin = "round"; // Round corners
    
    ctx.moveTo(points[0].x, points[0].y);

    // This is the "Smoothing" loop
    for (let i = 1; i < points.length - 2; i++) {
        // Find the midpoint between this point and the next
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        
        // Draw a curve to the midpoint
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    // Connect to the very last point
    ctx.quadraticCurveTo(
        points[points.length - 2].x, 
        points[points.length - 2].y, 
        points[points.length - 1].x, 
        points[points.length - 1].y
    );

    ctx.stroke();
}
// function draw() {
//     // 1. Clear the canvas for the new frame
//     ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), 
//     canvas.height / (window.devicePixelRatio || 1));
//     ctx.lineCap = "round";  // Makes ends of lines circular
//     ctx.lineJoin = "round"; // Makes corners where lines meet circular
//     ctx.imageSmoothingEnabled = true; // Ensures the browser uses anti-aliasing

//     // 2. Calculate dynamic sizing based on level density
//     // This prevents dots from feeling "too big" when there are many of them
//     const pairCount = dots.length / 2;
//     const dotRadius = Math.max(15, 22 - (pairCount * 0.8)); 
//     const pathWidth = Math.max(6, 12 - (pairCount * 0.5));

//     // 3. Draw Static Obstacles (The "Dead Zones")
//     obstacles.forEach(obs => {
//         ctx.save();
//         ctx.beginPath();
//         ctx.arc(obs.x, obs.y, dotRadius * 0.7, 0, Math.PI * 2);
//         ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
//         ctx.fill();
//         // Draw a subtle "X" inside the obstacle
//         ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
//         ctx.lineWidth = 2;
//         const s = dotRadius * 0.3;
//         ctx.moveTo(obs.x - s, obs.y - s); ctx.lineTo(obs.x + s, obs.y + s);
//         ctx.moveTo(obs.x + s, obs.y - s); ctx.lineTo(obs.x - s, obs.y + s);
//         ctx.stroke();
//         ctx.restore();
//     });

//     // 4. Draw Completed Paths
//     ctx.lineCap = 'round';
//     ctx.lineJoin = 'round';
//     ctx.lineWidth = pathWidth;

//     paths.forEach(p => {
//         ctx.beginPath();
//         ctx.strokeStyle = p.color;
//         // Adding a slight glow to paths
//         ctx.shadowBlur = 8;
//         ctx.shadowColor = p.color;
//         p.points.forEach((pt, i) => {
//             if (i === 0) ctx.moveTo(pt.x, pt.y);
//             else ctx.lineTo(pt.x, pt.y);
//         });
//         ctx.stroke();
//         ctx.shadowBlur = 0; // Reset glow
//     });

//     // 5. Draw the Active Path (the one the user is currently drawing)
//     if (isDrawing && startDot) {
//         ctx.beginPath();
//         ctx.strokeStyle = startDot.color;
//         ctx.globalAlpha = 0.6; // Make current path semi-transparent
//         ctx.setLineDash([5, 5]); // Optional: make current path dashed for style
//         currentPath.forEach((pt, i) => {
//             if (i === 0) ctx.moveTo(pt.x, pt.y);
//             else ctx.lineTo(pt.x, pt.y);
//         });
//         ctx.stroke();
//         ctx.setLineDash([]); // Reset dash
//         ctx.globalAlpha = 1.0;
//     }

//     // 6. Draw Dots (Nodes) - Drawn last so they stay on top of paths
//     dots.forEach(d => {
//         ctx.save();
        
//         // Inner Glow
//         ctx.shadowBlur = d.connected ? 20 : 10;
//         ctx.shadowColor = d.color;
        
//         // Main Circle
//         ctx.beginPath();
//         ctx.arc(d.x, d.y, dotRadius, 0, Math.PI * 2);
//         ctx.fillStyle = d.color;
//         ctx.fill();

//         // If it's the dot the user just clicked, give it a white border
//         if (d === startDot) {
//             ctx.strokeStyle = "white";
//             ctx.lineWidth = 3;
//             ctx.stroke();
//         }

//         // If connected, draw a small inner "core"
//         if (d.connected) {
//             ctx.beginPath();
//             ctx.arc(d.x, d.y, dotRadius * 0.4, 0, Math.PI * 2);
//             ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
//             ctx.fill();
//         }

//         ctx.restore();
//     });
// }


function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Setup High Quality Line Settings
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    const isMobile = window.innerWidth < 768;
    const pairCount = dots.length / 2;
    const pathWidth = Math.max(6, 12 - (pairCount * 0.5));
    const dotRadius = Math.max(15, 22 - (pairCount * 0.8));

    // 1. Draw Saved Paths
    paths.forEach(p => {
        ctx.beginPath();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = pathWidth;
        
        // Only show glow on Desktop to save Mobile battery/CPU
        if (!isMobile) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
        }

        if (p.points.length > 0) {
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let i = 1; i < p.points.length - 1; i++) {
                const xc = (p.points[i].x + p.points[i + 1].x) / 2;
                const yc = (p.points[i].y + p.points[i + 1].y) / 2;
                ctx.quadraticCurveTo(p.points[i].x, p.points[i].y, xc, yc);
            }
            const last = p.points[p.points.length - 1];
            ctx.lineTo(last.x, last.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset glow
    });

    // 2. Draw Active Path (The one you are currently drawing)
    if (isDrawing && currentPath.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = startDot.color;
        ctx.lineWidth = pathWidth;
        ctx.globalAlpha = 0.6;

        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length - 1; i++) {
            const xc = (currentPath[i].x + currentPath[i + 1].x) / 2;
            const yc = (currentPath[i].y + currentPath[i + 1].y) / 2;
            ctx.quadraticCurveTo(currentPath[i].x, currentPath[i].y, xc, yc);
        }
        const last = currentPath[currentPath.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    // 3. Draw Obstacles
    obstacles.forEach(obs => {
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, dotRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 2;
        const s = dotRadius * 0.3;
        ctx.moveTo(obs.x - s, obs.y - s); ctx.lineTo(obs.x + s, obs.y + s);
        ctx.moveTo(obs.x + s, obs.y - s); ctx.lineTo(obs.x - s, obs.y + s);
        ctx.stroke();
    });

    // 4. Draw Dots
    dots.forEach(d => {
        ctx.save();
        if (!isMobile) {
            ctx.shadowBlur = d.connected ? 20 : 10;
            ctx.shadowColor = d.color;
        }
        ctx.beginPath();
        ctx.arc(d.x, d.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.fill();

        if (d === startDot) {
            ctx.strokeStyle = "white";
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ctx.restore();
    });
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('soundEnabled', soundEnabled);
    updateHomeUI();
    if(isplaying === false) {
        music.play();
        isplaying = true;
    }else {
        music.pause();
        isplaying = false;
    }
}

function resetLevel() { loadLevel(currentLevel); }
updateHomeUI();

function clearSave() {
    // A stylized confirmation using the standard confirm for safety
    if (confirm("WARNING: This will erase all level progress. Are you sure?")) {
        localStorage.removeItem('pathWeaverLevel');
        currentLevel = 1;
        
        // Update the Home Screen text immediately
        const info = document.getElementById('save-info');
        if (info) info.innerHTML = "DATA PURGED. NEW MISSION DETECTED.";
        
        // Play a low "error" tone to signify the wipe
        AudioEngine.error();
    }
}
function updateProgress() {
    const connectedCount = dots.filter(d => d.connected).length / 2;
    const totalPairs = dots.length / 2;
    const percentage = (connectedCount / totalPairs) * 100;
    document.getElementById('level-progress').style.width = percentage + '%';
}

