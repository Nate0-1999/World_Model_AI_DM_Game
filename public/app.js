const form = document.getElementById("campaign-form");
const settingInput = document.getElementById("setting");
const characterInput = document.getElementById("character");
const directionInput = document.getElementById("direction");

const openWorldBtn = document.getElementById("open-world");
const observeBtn = document.getElementById("observe");
const nextSceneBtn = document.getElementById("next-scene");
const autoToggleBtn = document.getElementById("auto-toggle");

const sceneTitleEl = document.getElementById("scene-title");
const sceneBriefEl = document.getElementById("scene-brief");
const worldPromptEl = document.getElementById("world-prompt");
const worldsClearedEl = document.getElementById("worlds-cleared");
const inventoryEl = document.getElementById("inventory");
const logEl = document.getElementById("log");

const state = {
  setting: "",
  character: "",
  direction: "",
  scene: null,
  history: [],
  inventory: [],
  worldsCleared: 0,
  currentSceneCleared: false,
  lastObservation: null,
  worldWindow: null,
  worldReady: false,
  autoObserveHandle: null,
  pendingCaptureResolver: null,
  pendingCaptureRejecter: null
};

function nowStamp() {
  return new Date().toLocaleTimeString();
}

function pushLog(title, body, detail) {
  const entry = document.createElement("div");
  entry.className = "log-entry";

  const time = document.createElement("div");
  time.className = "log-time";
  time.textContent = `[${nowStamp()}] ${title}`;

  const text = document.createElement("div");
  text.textContent = body;

  entry.append(time, text);

  if (detail) {
    const pre = document.createElement("pre");
    pre.textContent = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
    entry.append(pre);
  }

  logEl.prepend(entry);
}

function renderInventory() {
  inventoryEl.innerHTML = "";
  if (!state.inventory.length) {
    const li = document.createElement("li");
    li.textContent = "None";
    inventoryEl.append(li);
    return;
  }

  for (const item of state.inventory) {
    const li = document.createElement("li");
    li.textContent = item;
    inventoryEl.append(li);
  }
}

function renderScene() {
  sceneTitleEl.textContent = state.scene?.scene_title || "None";
  sceneBriefEl.textContent = state.scene?.scene_brief || "";
  worldPromptEl.textContent = state.scene?.world_prompt || "";
  worldsClearedEl.textContent = String(state.worldsCleared);
  renderInventory();

  const ready = Boolean(state.scene);
  openWorldBtn.disabled = !ready;
  observeBtn.disabled = !ready;
  nextSceneBtn.disabled = !ready;
  autoToggleBtn.disabled = !ready;
}

async function callApi(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

async function generateScene(mode) {
  const result = await callApi("/api/dm/scene", {
    mode,
    setting: state.setting,
    character: state.character,
    direction: state.direction,
    history: state.history,
    inventory: state.inventory
  });

  state.scene = result.scene;
  state.currentSceneCleared = false;
  state.history.push({
    type: mode,
    scene_title: result.scene.scene_title,
    scene_brief: result.scene.scene_brief,
    mood: result.scene.mood,
    biome: result.scene.biome,
    timestamp: Date.now()
  });

  renderScene();
  pushLog(
    `Scene generated (${result.source})`,
    `${result.scene.scene_title}: ${result.scene.scene_brief}`,
    result.scene
  );

  if (state.worldWindow && !state.worldWindow.closed) {
    sendSceneToWorld();
  }
}

function openWorldWindow() {
  if (state.worldWindow && !state.worldWindow.closed) {
    state.worldWindow.focus();
    return;
  }

  const popup = window.open("/world.html", "worldmodel-world", "width=1220,height=840");
  state.worldWindow = popup;
  state.worldReady = false;

  if (!popup) {
    pushLog("Popup blocked", "Allow popups for localhost to open the world window.");
    return;
  }

  pushLog("World window", "Opened. Waiting for world runtime handshake.");
}

function sendSceneToWorld() {
  if (!state.worldWindow || state.worldWindow.closed) {
    pushLog("World missing", "Open the world window first.");
    return;
  }

  state.worldWindow.postMessage({ type: "load-scene", scene: state.scene }, window.location.origin);
  pushLog("World scene load", `Sent scene: ${state.scene.scene_title}`);
}

function requestWorldCapture() {
  return new Promise((resolve, reject) => {
    if (!state.worldWindow || state.worldWindow.closed) {
      reject(new Error("World window is not open."));
      return;
    }

    state.pendingCaptureResolver = resolve;
    state.pendingCaptureRejecter = reject;

    state.worldWindow.postMessage({ type: "capture-frame" }, window.location.origin);

    setTimeout(() => {
      if (state.pendingCaptureRejecter === reject) {
        state.pendingCaptureResolver = null;
        state.pendingCaptureRejecter = null;
        reject(new Error("Capture timeout. Ensure world window is active."));
      }
    }, 6000);
  });
}

function addRewardIfNew(rewardItem) {
  if (!rewardItem) return false;
  if (state.inventory.includes(rewardItem)) return false;
  state.inventory.push(rewardItem);
  return true;
}

async function observeWorld() {
  try {
    const capture = await requestWorldCapture();

    const result = await callApi("/api/dm/observe", {
      imageDataUrl: capture.imageDataUrl,
      scene: state.scene,
      setting: state.setting,
      character: state.character,
      inventory: state.inventory,
      history: state.history,
      worldState: capture.worldState
    });

    state.lastObservation = result.observation;

    let rewardAdded = false;
    if (result.observation.likely_cleared && !state.currentSceneCleared) {
      state.currentSceneCleared = true;
      state.worldsCleared += 1;
      rewardAdded = addRewardIfNew(result.observation.reward_item);
    }

    renderScene();

    const summary = [
      result.observation.summary,
      `fun_signal=${result.observation.fun_signal}`,
      `likely_cleared=${result.observation.likely_cleared}`,
      `next_twist=${result.observation.next_twist}`
    ].join(" | ");

    pushLog(`Observation (${result.source})`, summary, {
      worldState: capture.worldState,
      observation: result.observation,
      rewardAdded
    });
  } catch (error) {
    pushLog("Observation failed", error.message);
  }
}

function toggleAutoObserve() {
  if (state.autoObserveHandle) {
    clearInterval(state.autoObserveHandle);
    state.autoObserveHandle = null;
    autoToggleBtn.textContent = "Start Auto Observe";
    pushLog("Auto observe", "Stopped.");
    return;
  }

  state.autoObserveHandle = setInterval(() => {
    observeWorld();
  }, 15000);

  autoToggleBtn.textContent = "Stop Auto Observe";
  pushLog("Auto observe", "Running every 15 seconds.");
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const { data } = event;
  if (!data || typeof data !== "object") return;

  if (data.type === "world-ready") {
    state.worldReady = true;
    pushLog("World runtime", "Handshake complete.");
    if (state.scene) {
      sendSceneToWorld();
    }
    return;
  }

  if (data.type === "frame-capture") {
    if (state.pendingCaptureResolver) {
      state.pendingCaptureResolver({
        imageDataUrl: data.imageDataUrl,
        worldState: data.worldState
      });
      state.pendingCaptureResolver = null;
      state.pendingCaptureRejecter = null;
    }
    return;
  }

  if (data.type === "world-event") {
    pushLog("World event", data.message || "Event received", data.worldState || null);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.setting = settingInput.value.trim();
  state.character = characterInput.value.trim();
  state.direction = directionInput.value.trim();

  if (!state.setting || !state.character) {
    pushLog("Missing input", "Setting and character are required.");
    return;
  }

  await generateScene("opening");
});

openWorldBtn.addEventListener("click", () => {
  openWorldWindow();
});

observeBtn.addEventListener("click", () => {
  observeWorld();
});

nextSceneBtn.addEventListener("click", async () => {
  if (state.lastObservation?.next_twist) {
    state.direction = state.lastObservation.next_twist;
  }
  await generateScene("next");
});

autoToggleBtn.addEventListener("click", () => {
  toggleAutoObserve();
});

renderScene();
pushLog("Boot", "DM console ready.");
