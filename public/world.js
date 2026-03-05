const canvas = document.getElementById("world-canvas");
const ctx = canvas.getContext("2d");

const sceneTitleEl = document.getElementById("scene-title");
const objectiveEl = document.getElementById("objective");
const stateEl = document.getElementById("state");

function getHostWindow() {
  if (window.opener && !window.opener.closed) return window.opener;
  if (window.parent && window.parent !== window) return window.parent;
  return null;
}

function postToHost(message) {
  const host = getHostWindow();
  if (!host) return;
  host.postMessage(message, window.location.origin);
}

const world = {
  scene: null,
  width: canvas.width,
  height: canvas.height,
  keys: new Set(),
  frame: 0,
  encounters: 0,
  objectiveReached: false,
  collisions: 0,
  startedAt: Date.now(),
  messages: [],
  player: {
    x: 120,
    y: 120,
    r: 12,
    speed: 3.2,
    hp: 5
  },
  objective: {
    x: 980,
    y: 620,
    r: 18
  },
  enemies: [],
  particles: [],
  palette: {
    base: "#122022",
    mid: "#254847",
    high: "#80b9a8",
    glow: "#e7d97f"
  }
};

function hashString(input) {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pickPalette(seed) {
  const palettes = [
    { base: "#102014", mid: "#214232", high: "#9acfa1", glow: "#f2c66c" },
    { base: "#1e1226", mid: "#4f2958", high: "#d199d9", glow: "#ffd477" },
    { base: "#1f1a10", mid: "#54482c", high: "#c8bc87", glow: "#f4d66f" },
    { base: "#101d28", mid: "#21506f", high: "#8ec7e9", glow: "#ffe08d" },
    { base: "#22110f", mid: "#6e3a2c", high: "#dfb299", glow: "#f2e17f" }
  ];
  return palettes[seed % palettes.length];
}

function resetFromScene(scene) {
  world.scene = scene || null;
  world.frame = 0;
  world.encounters = 0;
  world.objectiveReached = false;
  world.collisions = 0;
  world.startedAt = Date.now();
  world.messages = [];
  world.player.hp = 5;

  const seed = hashString(`${scene?.scene_title || "scene"}|${scene?.world_prompt || ""}`);
  const rng = createRng(seed);
  world.palette = pickPalette(seed);

  world.player.x = 80 + rng() * (world.width * 0.2);
  world.player.y = 90 + rng() * (world.height * 0.2);

  world.objective.x = world.width * (0.6 + rng() * 0.3);
  world.objective.y = world.height * (0.55 + rng() * 0.35);

  world.enemies = Array.from({ length: 12 }).map((_, index) => ({
    id: `enemy-${index + 1}`,
    x: 80 + rng() * (world.width - 160),
    y: 80 + rng() * (world.height - 160),
    r: 10 + rng() * 7,
    vx: (rng() - 0.5) * 1.2,
    vy: (rng() - 0.5) * 1.2,
    alive: true,
    jitter: rng() * Math.PI * 2
  }));

  const defaultObjective = scene?.clear_signal || "Reach the relic marker and survive ambient threats.";

  sceneTitleEl.textContent = scene?.scene_title || "Untitled world";
  objectiveEl.textContent = defaultObjective;
  stateEl.textContent = "Exploring";

  world.messages.push(`Loaded: ${scene?.scene_title || "Untitled"}`);
}

function addParticle(x, y, color) {
  world.particles.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 3,
    vy: (Math.random() - 0.5) * 3,
    life: 26,
    color
  });
}

function updatePlayer() {
  let dx = 0;
  let dy = 0;

  if (world.keys.has("ArrowUp") || world.keys.has("w") || world.keys.has("W")) dy -= 1;
  if (world.keys.has("ArrowDown") || world.keys.has("s") || world.keys.has("S")) dy += 1;
  if (world.keys.has("ArrowLeft") || world.keys.has("a") || world.keys.has("A")) dx -= 1;
  if (world.keys.has("ArrowRight") || world.keys.has("d") || world.keys.has("D")) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    world.player.x += dx * world.player.speed;
    world.player.y += dy * world.player.speed;
  }

  world.player.x = Math.max(world.player.r, Math.min(world.width - world.player.r, world.player.x));
  world.player.y = Math.max(world.player.r, Math.min(world.height - world.player.r, world.player.y));
}

function updateEnemies() {
  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;

    enemy.jitter += 0.02;
    enemy.x += enemy.vx + Math.cos(enemy.jitter) * 0.22;
    enemy.y += enemy.vy + Math.sin(enemy.jitter * 1.17) * 0.22;

    if (enemy.x < enemy.r || enemy.x > world.width - enemy.r) enemy.vx *= -1;
    if (enemy.y < enemy.r || enemy.y > world.height - enemy.r) enemy.vy *= -1;

    const dist = Math.hypot(world.player.x - enemy.x, world.player.y - enemy.y);
    if (dist < world.player.r + enemy.r) {
      world.encounters += 1;
      world.collisions += 1;
      world.player.hp = Math.max(1, world.player.hp - 1);
      enemy.alive = false;
      addParticle(enemy.x, enemy.y, world.palette.glow);
      stateEl.textContent = "In conflict";

      if (world.encounters % 3 === 0) {
        postToHost({
          type: "world-event",
          message: `Encounter burst: ${world.encounters} total`,
          worldState: collectWorldState()
        });
      }
    }
  }
}

function updateObjective() {
  if (world.objectiveReached) return;

  const dist = Math.hypot(world.player.x - world.objective.x, world.player.y - world.objective.y);
  if (dist < world.player.r + world.objective.r) {
    world.objectiveReached = true;
    stateEl.textContent = "Objective reached";
    world.messages.push("Objective reached");
    for (let i = 0; i < 24; i += 1) {
      addParticle(world.objective.x, world.objective.y, "#fff2ad");
    }

    postToHost({
      type: "world-event",
      message: "Objective reached by player",
      worldState: collectWorldState()
    });
  }
}

function updateParticles() {
  for (const p of world.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;
  }
  world.particles = world.particles.filter((p) => p.life > 0);
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, world.width, world.height);
  grad.addColorStop(0, world.palette.base);
  grad.addColorStop(0.55, world.palette.mid);
  grad.addColorStop(1, "#0d1014");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, world.width, world.height);

  for (let i = 0; i < 90; i += 1) {
    const x = (i * 129.1 + world.frame * 0.15) % world.width;
    const y = (i * 87.9) % world.height;
    const radius = 1 + ((i * 37) % 3);
    ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 5) * 0.01})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawObjective() {
  if (world.objectiveReached) return;

  const pulse = 8 + Math.sin(world.frame * 0.08) * 4;
  ctx.strokeStyle = world.palette.glow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(world.objective.x, world.objective.y, world.objective.r + pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#f9e89e";
  ctx.beginPath();
  ctx.arc(world.objective.x, world.objective.y, world.objective.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemies() {
  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;
    ctx.fillStyle = "rgba(180, 20, 30, 0.88)";
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 180, 140, 0.5)";
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPlayer() {
  ctx.fillStyle = world.palette.high;
  ctx.beginPath();
  ctx.arc(world.player.x, world.player.y, world.player.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(world.player.x, world.player.y, world.player.r + 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawParticles() {
  for (const p of world.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0.1, p.life / 26);
    ctx.fillRect(p.x, p.y, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawOverlay() {
  const aliveEnemies = world.enemies.filter((e) => e.alive).length;
  ctx.fillStyle = "rgba(10, 15, 20, 0.4)";
  ctx.fillRect(12, 12, 255, 88);

  ctx.fillStyle = "#e7edf1";
  ctx.font = "15px IBM Plex Mono, monospace";
  ctx.fillText(`HP: ${world.player.hp}`, 20, 36);
  ctx.fillText(`Encounters: ${world.encounters}`, 20, 58);
  ctx.fillText(`Enemies left: ${aliveEnemies}`, 20, 80);
}

function render() {
  drawBackground();
  drawObjective();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawOverlay();
}

function collectWorldState() {
  const aliveEnemies = world.enemies.filter((e) => e.alive).length;
  return {
    sceneTitle: world.scene?.scene_title || null,
    objectiveReached: world.objectiveReached,
    encounters: world.encounters,
    collisions: world.collisions,
    hp: world.player.hp,
    aliveEnemies,
    elapsedSec: Math.round((Date.now() - world.startedAt) / 1000),
    player: {
      x: Math.round(world.player.x),
      y: Math.round(world.player.y)
    },
    recent: world.messages.slice(-4)
  };
}

function tick() {
  world.frame += 1;
  updatePlayer();
  updateEnemies();
  updateObjective();
  updateParticles();
  render();
  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (event) => {
  world.keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  world.keys.delete(event.key);
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const { data } = event;
  if (!data || typeof data !== "object") return;

  if (data.type === "load-scene") {
    resetFromScene(data.scene);
    return;
  }

  if (data.type === "host-ping") {
    postToHost({ type: "world-ready" });
    return;
  }

  if (data.type === "capture-frame") {
    const imageDataUrl = canvas.toDataURL("image/png");
    postToHost({
      type: "frame-capture",
      imageDataUrl,
      worldState: collectWorldState()
    });
  }
});

postToHost({ type: "world-ready" });

resetFromScene({
  scene_title: "Awaiting DM scene",
  world_prompt: "Idle world",
  clear_signal: "Wait for DM to send scene"
});

tick();
