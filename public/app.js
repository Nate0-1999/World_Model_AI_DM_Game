const form = document.getElementById("campaign-form");
const settingInput = document.getElementById("setting");
const characterInput = document.getElementById("character");
const directionInput = document.getElementById("direction");

const openWorldBtn = document.getElementById("open-world");
const observeBtn = document.getElementById("observe");
const nextSceneBtn = document.getElementById("next-scene");
const autoToggleBtn = document.getElementById("auto-toggle");
const autoTransitionInput = document.getElementById("auto-transition");
const worldInlineFrame = document.getElementById("world-inline-frame");

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
  inlineReady: false,
  popupReady: false,
  autoObserveHandle: null,
  pendingCaptureResolver: null,
  pendingCaptureRejecter: null,
  isGenerating: false,
  isObserving: false,
  pendingAutoTransition: false
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

function hasReadyWorld() {
  return state.inlineReady || state.popupReady;
}

function renderScene() {
  sceneTitleEl.textContent = state.scene?.scene_title || "None";
  sceneBriefEl.textContent = state.scene?.scene_brief || "";
  worldPromptEl.textContent = state.scene?.world_prompt || "";
  worldsClearedEl.textContent = String(state.worldsCleared);
  renderInventory();

  const sceneReady = Boolean(state.scene);
  openWorldBtn.disabled = !sceneReady;
  observeBtn.disabled = !sceneReady || !hasReadyWorld() || state.isObserving;
  nextSceneBtn.disabled = !sceneReady || state.isGenerating;
  autoToggleBtn.disabled = !sceneReady || !hasReadyWorld();
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

function getWorldTargets() {
  const targets = [];

  if (worldInlineFrame?.contentWindow) {
    targets.push({ label: "inline", win: worldInlineFrame.contentWindow, ready: state.inlineReady });
  }

  if (state.worldWindow && !state.worldWindow.closed) {
    targets.push({ label: "popup", win: state.worldWindow, ready: state.popupReady });
  }

  return targets;
}

function getCaptureTarget() {
  const targets = getWorldTargets();
  const inline = targets.find((t) => t.label === "inline" && t.ready);
  if (inline) return inline;
  const popup = targets.find((t) => t.label === "popup" && t.ready);
  if (popup) return popup;
  return null;
}

function postToWorld(target, message) {
  target.win.postMessage(message, window.location.origin);
}

function syncSceneToReadyWorlds() {
  if (!state.scene) return;

  let count = 0;
  for (const target of getWorldTargets()) {
    if (!target.ready) continue;
    postToWorld(target, { type: "load-scene", scene: state.scene });
    count += 1;
  }

  if (count > 0) {
    pushLog("World scene load", `Sent scene '${state.scene.scene_title}' to ${count} runtime(s).`);
  } else {
    pushLog("World sync pending", "Scene ready; waiting for world runtime handshake.");
  }
}

async function generateScene(mode) {
  if (state.isGenerating) {
    pushLog("Scene generation", "Skipped duplicate request while generation is in progress.");
    return;
  }

  state.isGenerating = true;
  renderScene();

  try {
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

    pushLog(
      `Scene generated (${result.source})`,
      `${result.scene.scene_title}: ${result.scene.scene_brief}`,
      result.scene
    );

    syncSceneToReadyWorlds();
  } catch (error) {
    pushLog("Scene generation failed", error.message);
  } finally {
    state.isGenerating = false;
    renderScene();
  }
}

function openWorldWindow() {
  if (state.worldWindow && !state.worldWindow.closed) {
    state.worldWindow.focus();
    return;
  }

  const popup = window.open("/world.html", "worldmodel-world", "width=1220,height=840");
  state.worldWindow = popup;
  state.popupReady = false;

  if (!popup) {
    pushLog("Popup blocked", "Allow popups for localhost if you want a separate world window.");
    return;
  }

  pushLog("World popout", "Opened. Waiting for runtime handshake.");
  renderScene();
}

function requestWorldCapture() {
  return new Promise((resolve, reject) => {
    const target = getCaptureTarget();
    if (!target) {
      reject(new Error("No ready world runtime. Wait for world load and try again."));
      return;
    }

    state.pendingCaptureResolver = resolve;
    state.pendingCaptureRejecter = reject;

    postToWorld(target, { type: "capture-frame" });

    setTimeout(() => {
      if (state.pendingCaptureRejecter === reject) {
        state.pendingCaptureResolver = null;
        state.pendingCaptureRejecter = null;
        reject(new Error("Capture timeout. Ensure world view is active."));
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

function applyDeterministicClear(observation, worldState, scene) {
  const deterministicClear = Boolean(worldState?.objectiveReached);
  if (!deterministicClear) {
    return observation;
  }

  const fallbackReward = `Relic of ${scene?.scene_title || "Unknown Realm"}`;
  return {
    ...observation,
    likely_cleared: true,
    reward_item: observation.reward_item || fallbackReward,
    dm_note: `${observation.dm_note || ""} Deterministic clear rule confirmed.`.trim()
  };
}

async function observeWorld() {
  if (state.isObserving) return;

  state.isObserving = true;
  renderScene();

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

    const observation = applyDeterministicClear(result.observation, capture.worldState, state.scene);
    state.lastObservation = observation;

    let rewardAdded = false;
    if (observation.likely_cleared && !state.currentSceneCleared) {
      state.currentSceneCleared = true;
      state.worldsCleared += 1;
      rewardAdded = addRewardIfNew(observation.reward_item);

      if (autoTransitionInput.checked && !state.pendingAutoTransition) {
        state.pendingAutoTransition = true;
        const nextTwist = observation.next_twist;
        pushLog("Scene cleared", "Auto-transitioning to next scene...");

        setTimeout(async () => {
          try {
            if (nextTwist) {
              state.direction = nextTwist;
            }
            await generateScene("next");
          } finally {
            state.pendingAutoTransition = false;
          }
        }, 500);
      }
    }

    const summary = [
      observation.summary,
      `fun_signal=${observation.fun_signal}`,
      `likely_cleared=${observation.likely_cleared}`,
      `next_twist=${observation.next_twist}`
    ].join(" | ");

    pushLog(`Observation (${result.source})`, summary, {
      worldState: capture.worldState,
      observation,
      rewardAdded
    });
  } catch (error) {
    pushLog("Observation failed", error.message);
  } finally {
    state.isObserving = false;
    renderScene();
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
  }, 12000);

  autoToggleBtn.textContent = "Stop Auto Observe";
  pushLog("Auto observe", "Running every 12 seconds.");
}

function markRuntimeReadyFromSource(sourceWindow) {
  if (worldInlineFrame?.contentWindow && sourceWindow === worldInlineFrame.contentWindow) {
    state.inlineReady = true;
    return "inline";
  }

  if (state.worldWindow && !state.worldWindow.closed && sourceWindow === state.worldWindow) {
    state.popupReady = true;
    return "popup";
  }

  return "unknown";
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const { data } = event;
  if (!data || typeof data !== "object") return;

  if (data.type === "world-ready") {
    const sourceLabel = markRuntimeReadyFromSource(event.source);
    pushLog("World runtime", `Handshake complete (${sourceLabel}).`);
    syncSceneToReadyWorlds();
    renderScene();
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

worldInlineFrame?.addEventListener("load", () => {
  state.inlineReady = false;
  pushLog("World view", "Inline world loaded. Waiting for handshake.");

  if (worldInlineFrame.contentWindow) {
    worldInlineFrame.contentWindow.postMessage({ type: "host-ping" }, window.location.origin);
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

(async () => {
  try {
    const healthResp = await fetch("/api/health");
    const health = await healthResp.json();
    pushLog(
      "Backend",
      `API up. OpenRouter configured=${health.openrouterConfigured}. DM models: ${health.textModel} / ${health.visionModel}`
    );
  } catch {
    pushLog("Backend", "Health check failed. Start server with python3 server.py");
  }
})();

let inlinePingAttempts = 0;
const inlinePingTimer = setInterval(() => {
  inlinePingAttempts += 1;
  if (state.inlineReady || inlinePingAttempts > 8) {
    clearInterval(inlinePingTimer);
    return;
  }
  if (worldInlineFrame?.contentWindow) {
    worldInlineFrame.contentWindow.postMessage({ type: "host-ping" }, window.location.origin);
  }
}, 500);

renderScene();
pushLog("Boot", "DM console ready. Fill setting + character, generate opening scene, then play in the embedded world.");
