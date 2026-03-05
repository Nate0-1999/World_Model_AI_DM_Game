#!/usr/bin/env python3
import asyncio
import json
import mimetypes
import os
import re
import traceback
from dataclasses import asdict, is_dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib import error, request

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"

try:
    from odyssey import Odyssey

    ODYSSEY_SDK_IMPORT_ERROR = ""
except Exception as exc:
    Odyssey = None
    ODYSSEY_SDK_IMPORT_ERROR = str(exc)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(ROOT / ".env")

PORT = int(os.environ.get("PORT", "8787"))
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
TEXT_MODEL = os.environ.get("OPENROUTER_TEXT_MODEL", "google/gemini-3-flash")
VISION_MODEL = os.environ.get("OPENROUTER_VISION_MODEL", "google/gemini-3-flash")
SITE_URL = os.environ.get("OPENROUTER_SITE_URL", f"http://localhost:{PORT}")
SITE_NAME = os.environ.get("OPENROUTER_SITE_NAME", "WorldModel DND DM Local")
ODYSSEY_API_KEY = os.environ.get("ODYSSEY_API_KEY", "").strip()
ODYSSEY_DEFAULT_PORTRAIT = os.environ.get("ODYSSEY_DEFAULT_PORTRAIT", "false").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)


def extract_first_json(text: str):
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, flags=re.IGNORECASE)
    candidate = fenced.group(1) if fenced else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    snippet = candidate[start : end + 1]
    try:
        return json.loads(snippet)
    except json.JSONDecodeError:
        return None


def fallback_scene(setting, character, history, direction):
    step = len(history) + 1 if isinstance(history, list) else 1
    suffix = f" Focus: {direction}" if direction else ""
    return {
        "scene_title": f"Scene {step}: {setting or 'Untamed Lands'}",
        "scene_brief": f"{character or 'The adventurer'} enters a volatile pocket-world shaped by recent choices.{suffix}",
        "world_prompt": (
            f"Third-person exploration zone in {setting or 'a fantasy wilderness'}. "
            f"{character or 'The adventurer'} arrives amid flickering ruins, strange fauna, "
            "and one obvious point of interest. "
            "Tone: mysterious but adventurous. Include at least one creature encounter "
            "and one visible objective."
        ),
        "clear_signal": "Player has found or reached the objective and survived at least one encounter.",
        "mood": "mysterious_adventure",
        "biome": "ruins_forest",
    }


def fallback_observation(scene, world_state):
    encounters = int((world_state or {}).get("encounters", 0) or 0)
    objective_reached = bool((world_state or {}).get("objectiveReached"))
    item_name = f"Relic of {scene.get('scene_title', 'Unknown Realm')}" if objective_reached else None
    return {
        "summary": (
            "Player appears to have reached the main objective and stabilized the area."
            if objective_reached
            else "Player is still exploring and engaging with ambient threats."
        ),
        "fun_signal": "engaged" if encounters > 0 else "warming_up",
        "likely_cleared": objective_reached,
        "reward_item": item_name if objective_reached else None,
        "next_twist": (
            "The environment starts folding into a new biome, hinting at another threat tier."
            if objective_reached
            else "Escalate tension with a clearer trail toward the objective and one surprise encounter."
        ),
        "dm_note": (
            "World can transition when player requests next scene."
            if objective_reached
            else "Keep current world active and watch for objective completion."
        ),
    }


def to_jsonable(value):
    if is_dataclass(value):
        return to_jsonable(asdict(value))
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    as_dict = getattr(value, "dict", None)
    if callable(as_dict):
        try:
            return to_jsonable(as_dict())
        except Exception:
            pass

    if hasattr(value, "__dict__"):
        return {k: to_jsonable(v) for k, v in vars(value).items() if not k.startswith("_")}

    return str(value)


def odyssey_unavailable_reason() -> str:
    if not ODYSSEY_API_KEY:
        return "ODYSSEY_API_KEY is not set"
    if Odyssey is None:
        return f"odyssey SDK is unavailable: {ODYSSEY_SDK_IMPORT_ERROR or 'import failed'}"
    return ""


def parse_query_params(path: str) -> dict[str, list[str]]:
    return parse_qs(urlparse(path).query)


def parse_bool(value, default=False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return default


def build_simulation_script(prompt: str, interactions: list[str], duration_ms: int) -> list[dict]:
    safe_prompt = (prompt or "").strip() or "A fantasy dungeon chamber with a clear objective"
    safe_interactions = [p.strip() for p in interactions if isinstance(p, str) and p.strip()]
    safe_duration = max(3000, min(int(duration_ms), 120000))
    timeline = [{"timestamp_ms": 0, "start": {"prompt": safe_prompt}}]

    if safe_interactions:
        spacing = max(2000, safe_duration // (len(safe_interactions) + 1))
        current_ts = spacing
        for interaction_prompt in safe_interactions:
            if current_ts >= safe_duration:
                break
            timeline.append({"timestamp_ms": current_ts, "interact": {"prompt": interaction_prompt}})
            current_ts += spacing

    timeline.append({"timestamp_ms": safe_duration, "end": {}})
    return timeline


async def odyssey_simulate(script: list[dict], portrait: bool):
    client = Odyssey(api_key=ODYSSEY_API_KEY)
    return await client.simulate(script=script, portrait=portrait)


async def odyssey_get_simulation_status(job_id: str):
    client = Odyssey(api_key=ODYSSEY_API_KEY)
    return await client.get_simulate_status(job_id)


async def odyssey_list_simulations(limit: int | None, offset: int | None):
    client = Odyssey(api_key=ODYSSEY_API_KEY)
    return await client.list_simulations(limit=limit, offset=offset)


async def odyssey_cancel_simulation(job_id: str):
    client = Odyssey(api_key=ODYSSEY_API_KEY)
    return await client.cancel_simulation(job_id)


async def odyssey_get_recording(stream_id: str):
    client = Odyssey(api_key=ODYSSEY_API_KEY)
    return await client.get_recording(stream_id)


def run_async(coro):
    return asyncio.run(coro)


def call_openrouter(model: str, messages, temperature: float = 0.8) -> str:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    payload = json.dumps(
        {
            "model": model,
            "temperature": temperature,
            "messages": messages,
        }
    ).encode("utf-8")

    req = request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": SITE_URL,
            "X-Title": SITE_NAME,
        },
    )

    try:
        with request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter error {exc.code}: {err_body}") from exc

    parsed = json.loads(body)
    content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "")

    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


class Handler(BaseHTTPRequestHandler):
    server_version = "WorldModelDND/0.1"

    def _send_json(self, status: int, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0") or 0)
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _serve_static(self, rel_path: str):
        safe_path = rel_path.split("?", 1)[0].split("#", 1)[0]
        if safe_path == "/":
            safe_path = "/index.html"

        target = (PUBLIC_DIR / safe_path.lstrip("/")).resolve()
        if not str(target).startswith(str(PUBLIC_DIR.resolve())) or not target.exists() or target.is_dir():
            self.send_error(404, "Not Found")
            return

        mime, _ = mimetypes.guess_type(str(target))
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{mime or 'application/octet-stream'}")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/health"):
            self._send_json(
                200,
                {
                    "ok": True,
                    "openrouterConfigured": bool(OPENROUTER_API_KEY),
                    "textModel": TEXT_MODEL,
                    "visionModel": VISION_MODEL,
                    "odysseyConfigured": bool(ODYSSEY_API_KEY),
                    "odysseySdkAvailable": Odyssey is not None,
                },
            )
            return
        if self.path.startswith("/api/odyssey/health"):
            return self.handle_odyssey_health()
        if self.path.startswith("/api/odyssey/simulations/status"):
            return self.handle_odyssey_simulation_status()
        if self.path.startswith("/api/odyssey/simulations/list"):
            return self.handle_odyssey_simulations_list()
        if self.path.startswith("/api/odyssey/recording"):
            return self.handle_odyssey_recording()

        self._serve_static(self.path)

    def do_POST(self):
        if self.path.startswith("/api/dm/scene"):
            return self.handle_scene()
        if self.path.startswith("/api/dm/observe"):
            return self.handle_observe()
        if self.path.startswith("/api/odyssey/simulations/start"):
            return self.handle_odyssey_simulation_start()
        if self.path.startswith("/api/odyssey/simulations/cancel"):
            return self.handle_odyssey_simulation_cancel()

        self._send_json(404, {"error": "Not found"})

    def _ensure_odyssey_ready(self):
        reason = odyssey_unavailable_reason()
        if reason:
            self._send_json(
                400,
                {
                    "ok": False,
                    "error": reason,
                    "odysseyConfigured": bool(ODYSSEY_API_KEY),
                    "odysseySdkAvailable": Odyssey is not None,
                    "sdkImportError": ODYSSEY_SDK_IMPORT_ERROR or None,
                },
            )
            return False
        return True

    def handle_odyssey_health(self):
        self._send_json(
            200,
            {
                "ok": True,
                "odysseyConfigured": bool(ODYSSEY_API_KEY),
                "odysseySdkAvailable": Odyssey is not None,
                "unavailableReason": odyssey_unavailable_reason() or None,
            },
        )

    def handle_odyssey_simulation_start(self):
        if not self._ensure_odyssey_ready():
            return

        body = self._read_json_body()
        portrait = parse_bool(body.get("portrait"), default=ODYSSEY_DEFAULT_PORTRAIT)
        prompt = body.get("prompt") if isinstance(body.get("prompt"), str) else ""
        duration_ms = body.get("duration_ms", 12000)
        try:
            duration_ms = int(duration_ms)
        except Exception:
            duration_ms = 12000

        interactions_raw = body.get("interactions")
        interactions = interactions_raw if isinstance(interactions_raw, list) else []

        script = body.get("script")
        if not isinstance(script, list) or not script:
            script = build_simulation_script(prompt, interactions, duration_ms)

        try:
            job = run_async(odyssey_simulate(script=script, portrait=portrait))
            self._send_json(
                200,
                {
                    "source": "odyssey",
                    "job": to_jsonable(job),
                    "script": script,
                    "portrait": portrait,
                },
            )
        except Exception as exc:
            self._send_json(500, {"source": "odyssey_error", "error": str(exc)})

    def handle_odyssey_simulation_status(self):
        if not self._ensure_odyssey_ready():
            return

        params = parse_query_params(self.path)
        job_id = (params.get("job_id") or [None])[0]
        if not job_id:
            self._send_json(400, {"error": "Missing required query parameter: job_id"})
            return

        try:
            status = run_async(odyssey_get_simulation_status(job_id))
            self._send_json(200, {"source": "odyssey", "status": to_jsonable(status)})
        except Exception as exc:
            self._send_json(500, {"source": "odyssey_error", "error": str(exc)})

    def handle_odyssey_simulations_list(self):
        if not self._ensure_odyssey_ready():
            return

        params = parse_query_params(self.path)
        limit_raw = (params.get("limit") or [None])[0]
        offset_raw = (params.get("offset") or [None])[0]

        try:
            limit = int(limit_raw) if limit_raw is not None else 10
        except Exception:
            limit = 10

        try:
            offset = int(offset_raw) if offset_raw is not None else 0
        except Exception:
            offset = 0

        try:
            result = run_async(odyssey_list_simulations(limit=limit, offset=offset))
            self._send_json(200, {"source": "odyssey", "result": to_jsonable(result)})
        except Exception as exc:
            self._send_json(500, {"source": "odyssey_error", "error": str(exc)})

    def handle_odyssey_simulation_cancel(self):
        if not self._ensure_odyssey_ready():
            return

        body = self._read_json_body()
        job_id = body.get("job_id")
        if not isinstance(job_id, str) or not job_id.strip():
            self._send_json(400, {"error": "Missing required body field: job_id"})
            return

        try:
            run_async(odyssey_cancel_simulation(job_id.strip()))
            self._send_json(200, {"source": "odyssey", "cancelled": True, "job_id": job_id.strip()})
        except Exception as exc:
            self._send_json(500, {"source": "odyssey_error", "error": str(exc)})

    def handle_odyssey_recording(self):
        if not self._ensure_odyssey_ready():
            return

        params = parse_query_params(self.path)
        stream_id = (params.get("stream_id") or [None])[0]
        if not stream_id:
            self._send_json(400, {"error": "Missing required query parameter: stream_id"})
            return

        try:
            recording = run_async(odyssey_get_recording(stream_id))
            self._send_json(200, {"source": "odyssey", "recording": to_jsonable(recording)})
        except Exception as exc:
            self._send_json(500, {"source": "odyssey_error", "error": str(exc)})

    def handle_scene(self):
        body = self._read_json_body()
        setting = body.get("setting")
        character = body.get("character")
        history = body.get("history") if isinstance(body.get("history"), list) else []
        inventory = body.get("inventory") if isinstance(body.get("inventory"), list) else []
        direction = body.get("direction")
        mode = body.get("mode") or "opening"

        fallback = fallback_scene(setting, character, history, direction)

        if not OPENROUTER_API_KEY:
            self._send_json(200, {"source": "fallback", "scene": fallback})
            return

        system = (
            "You are an autonomous dungeon master that controls a world-model campaign. "
            "Return ONLY valid JSON with keys: scene_title, scene_brief, world_prompt, clear_signal, mood, biome. "
            "No markdown, no prose outside JSON."
        )

        user = {
            "mode": mode,
            "setting": setting,
            "character": character,
            "inventory": inventory,
            "history": history,
            "direction": direction or None,
            "constraints": [
                "Design a scene that can be explored in a continuous world.",
                "Avoid hard fail states.",
                "Keep it playful and reactive.",
                "Prompt should be vivid and actionable for a world model generator.",
            ],
        }

        try:
            text = call_openrouter(
                model=TEXT_MODEL,
                temperature=0.9,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user)},
                ],
            )
            parsed = extract_first_json(text)
            if not parsed:
                self._send_json(200, {"source": "fallback_parse", "scene": fallback, "raw": text})
                return

            scene = {
                "scene_title": parsed.get("scene_title") or fallback["scene_title"],
                "scene_brief": parsed.get("scene_brief") or fallback["scene_brief"],
                "world_prompt": parsed.get("world_prompt") or fallback["world_prompt"],
                "clear_signal": parsed.get("clear_signal") or fallback["clear_signal"],
                "mood": parsed.get("mood") or fallback["mood"],
                "biome": parsed.get("biome") or fallback["biome"],
            }
            self._send_json(200, {"source": "openrouter", "scene": scene, "raw": text})
        except Exception as exc:
            self._send_json(200, {"source": "fallback_error", "scene": fallback, "error": str(exc)})

    def handle_observe(self):
        body = self._read_json_body()
        scene = body.get("scene") if isinstance(body.get("scene"), dict) else {}
        setting = body.get("setting")
        character = body.get("character")
        inventory = body.get("inventory") if isinstance(body.get("inventory"), list) else []
        history = body.get("history") if isinstance(body.get("history"), list) else []
        world_state = body.get("worldState") if isinstance(body.get("worldState"), dict) else {}
        image_data_url = body.get("imageDataUrl")

        fallback = fallback_observation(scene, world_state)

        if not OPENROUTER_API_KEY or not image_data_url:
            self._send_json(200, {"source": "fallback", "observation": fallback})
            return

        system = (
            "You are a multimodal dungeon master observer. "
            "You receive an in-game screenshot and game state. "
            "Return ONLY valid JSON with keys: summary, fun_signal, likely_cleared, reward_item, next_twist, dm_note. "
            "reward_item should be null unless likely_cleared is true."
        )

        context = {
            "setting": setting,
            "character": character,
            "scene": scene,
            "inventory": inventory,
            "history": history,
            "worldState": world_state,
        }

        try:
            text = call_openrouter(
                model=VISION_MODEL,
                temperature=0.6,
                messages=[
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Campaign context:\n{json.dumps(context)}",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": image_data_url},
                            },
                        ],
                    },
                ],
            )

            parsed = extract_first_json(text)
            if not parsed:
                self._send_json(200, {"source": "fallback_parse", "observation": fallback, "raw": text})
                return

            likely_cleared = bool(parsed.get("likely_cleared"))
            observation = {
                "summary": parsed.get("summary") or fallback["summary"],
                "fun_signal": parsed.get("fun_signal") or fallback["fun_signal"],
                "likely_cleared": likely_cleared,
                "reward_item": (parsed.get("reward_item") or fallback["reward_item"]) if likely_cleared else None,
                "next_twist": parsed.get("next_twist") or fallback["next_twist"],
                "dm_note": parsed.get("dm_note") or fallback["dm_note"],
            }

            self._send_json(200, {"source": "openrouter", "observation": observation, "raw": text})
        except Exception as exc:
            self._send_json(200, {"source": "fallback_error", "observation": fallback, "error": str(exc)})


if __name__ == "__main__":
    mimetypes.add_type("application/javascript", ".js")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"WorldModel DND DM local server: http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()
    except Exception:
        print(traceback.format_exc())
        server.server_close()
