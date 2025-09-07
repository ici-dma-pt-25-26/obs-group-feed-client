import { Room, RoomEvent, createLocalVideoTrack } from "https://esm.sh/livekit-client@2";

const TOKEN_ENDPOINT = "https://obs-group-signal-server.onrender.com/token";
const grid = document.getElementById("grid");
const overlayEl = document.getElementById("overlay");
let p5Sketch;

// OBS mode via query
const params = new URLSearchParams(location.search);
const OBS_MODE = params.get("mode") === "obs";
if (OBS_MODE) document.documentElement.classList.add("obs");

// Create or reuse a video element (with wrapper, optional label, and HUD)
function tile(peerId, labelText) {
  let v = document.getElementById("v_" + peerId);
  if (!v) {
    const wrap = document.createElement("div");
    wrap.className = "tile";
    v = document.createElement("video");
    v.id = "v_" + peerId;
    v.autoplay = true;
    v.playsInline = true;
    wrap.appendChild(v);
    if (!OBS_MODE) {
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = labelText || peerId;
      wrap.appendChild(label);
      // small emoji HUD
      const hud = document.createElement("div");
      hud.className = "hud";
      const emojis = ["🥳","❤️","🔥","😂","🤩"];
      emojis.forEach(e => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = e;
        b.title = "Send emoji";
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          selectedEmoji = e;
          publishEmoji(e, v, ev.clientX, ev.clientY);
        });
        hud.appendChild(b);
      });
      wrap.appendChild(hud);
    }
    grid.appendChild(wrap);
  }
  return v;
}

function removeTile(pid) {
  const v = document.getElementById("v_" + pid);
  if (v && v.parentElement) {
    const wrap = v.parentElement;
    wrap.parentElement && wrap.parentElement.removeChild(wrap);
  }
}

let selectedEmoji = null;
let lastEmojiAt = 0;
let visibilityObserver;
let activeRoom = null;

function publishEmoji(emoji, videoEl, clientX, clientY) {
  if (!activeRoom || !emoji || !videoEl) return;
  const now = Date.now();
  if (now - lastEmojiAt < 400) return; // rate limit
  lastEmojiAt = now;
  const vid = videoEl.id.startsWith("v_") ? videoEl.id.slice(2) : null;
  if (!vid) return;
  const r = videoEl.getBoundingClientRect();
  const ox = (clientX - r.left) / r.width;
  const oy = (clientY - r.top) / r.height;
  const payload = JSON.stringify({ type: "emoji", emoji, target: vid, ox, oy, t: Date.now() });
  activeRoom.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: false, topic: "emoji" });
  pushEmojiTarget(emoji, vid, ox, oy);
}

async function join() {
  // fetch token and LiveKit URL from your Render server
  const identity = Math.random().toString(36).slice(2);
  // pass a human-friendly name if available (prompt once per session)
  let nickname = sessionStorage.getItem("nickname");
  if (!nickname && !OBS_MODE) {
    nickname = prompt("Display name?", "") || "";
    sessionStorage.setItem("nickname", nickname);
  }
  const qs = new URLSearchParams({ identity, name: nickname || identity });
  const res = await fetch(`${TOKEN_ENDPOINT}?${qs.toString()}`);
  const { token, url } = await res.json();

  const room = new Room({ adaptiveStream: true, dynacast: true });
  activeRoom = room;

  // Local publish
  const cam = await createLocalVideoTrack({ resolution: { width: 640, height: 360 } });
  const me = tile(identity, nickname || "You");
  me.muted = true;
  cam.attach(me);
  try { await me.play(); } catch {}

  // Remote subscriptions
  room.on(RoomEvent.TrackSubscribed, async (track, pub, participant) => {
    if (track.kind === "video") {
  const v = tile(participant.identity, participant.name || participant.identity);
      track.attach(v);
      v.muted = true;
      try { await v.play(); } catch {}
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => {
    removeTile(participant.identity);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    removeTile(participant.identity);
  });

  room.on(RoomEvent.ConnectionStateChanged, (s) => {
    console.log("LiveKit state:", s);
  });

  // Pause videos when offscreen to save CPU
  const ensureObserver = () => {
    if (visibilityObserver) return;
    visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target;
        if (!(el instanceof HTMLVideoElement)) return;
        if (entry.isIntersecting) {
          // resume
          el.play().catch(()=>{});
        } else {
          // pause
          el.pause();
        }
      });
    }, { root: null, threshold: 0.01 });
  };
  ensureObserver();
  const observeAll = () => {
    document.querySelectorAll('#grid video').forEach(v => visibilityObserver.observe(v));
  };
  observeAll();
  const mo = new MutationObserver(() => observeAll());
  mo.observe(grid, { childList: true, subtree: true });

  // Emoji selection (press 1-5 to select)
  window.addEventListener("keydown", (e) => {
    const map = { "1": "🥳", "2": "❤️", "3": "🔥", "4": "😂", "5": "🤩" };
    const em = map[e.key];
    if (!em) return;
    selectedEmoji = em;
    console.log("Selected emoji:", selectedEmoji, "— click a video to send");
  });

  // Click a video to send targeted emoji
  grid.addEventListener("click", (ev) => {
    const v = ev.target.closest("video");
    if (!v || !selectedEmoji) return;
    publishEmoji(selectedEmoji, v, ev.clientX, ev.clientY);
  });

  // Receive data
  room.on(RoomEvent.DataReceived, (payload, _participant, _topic) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type === "emoji") {
        if (msg.target) pushEmojiTarget(msg.emoji, msg.target, msg.ox, msg.oy);
        else pushEmoji(msg.emoji);
      }
    } catch {}
  });

  await room.connect(url, token, { autoSubscribe: true });
  await room.localParticipant.publishTrack(cam);

  // Mobile: toggle overlay visibility on single tap anywhere
  let lastTap = 0;
  document.addEventListener('touchend', () => {
    const now = Date.now();
    // simple debounce for double taps
    if (now - lastTap < 250) return;
    lastTap = now;
    document.documentElement.classList.toggle('overlay-hidden');
  });
}

join().catch((e) => console.error(e));

// --- p5 overlay for emojis ---
const floating = []; // { emoji, anchorId?, x,y, ox, oy, vy, life, alpha }
function pushEmoji(emoji) {
  const w = window.innerWidth;
  const x = Math.random() * w;
  floating.push({ emoji, x, y: window.innerHeight - 60, vy: -1.5 - Math.random()*1.5, life: 120, alpha: 255 });
}

function pushEmojiTarget(emoji, anchorId, ox = 0.5, oy = 0.3) {
  // anchor to tile with id `v_${anchorId}`
  floating.push({ emoji, anchorId, x: 0, y: 0, ox, oy, vy: -1.2, life: 90, alpha: 255 });
}

function sketch(s) {
  s.setup = () => {
    const c = s.createCanvas(window.innerWidth, window.innerHeight);
    c.parent(overlayEl);
    s.clear();
  };
  s.windowResized = () => {
    s.resizeCanvas(window.innerWidth, window.innerHeight);
  };
  s.draw = () => {
    s.clear();
    s.textAlign(s.CENTER, s.CENTER);
    s.textSize(28);
    for (let i = floating.length - 1; i >= 0; i--) {
      const f = floating[i];
      let x = f.x;
      let y = f.y;
      if (f.anchorId) {
        const el = document.getElementById("v_" + f.anchorId);
        if (el) {
          const r = el.getBoundingClientRect();
          x = r.left + r.width * f.ox;
          const dy = (90 - f.life) * (-f.vy * 0.5);
          y = r.top + r.height * f.oy - dy;
        }
      } else {
        f.y += f.vy;
        y = f.y;
      }
      s.push();
      s.fill(255, f.alpha);
      s.text(f.emoji, x, y);
      s.pop();
      f.life--;
      f.alpha = Math.max(0, f.alpha - 3);
      if (f.life <= 0) floating.splice(i, 1);
    }
  };
}

p5Sketch = new p5(sketch);
