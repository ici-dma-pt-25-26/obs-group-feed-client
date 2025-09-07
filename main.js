import { Room, RoomEvent, createLocalVideoTrack, createLocalAudioTrack, ConnectionState, DataPacket_Kind } from "https://esm.sh/livekit-client@2";

const TOKEN_ENDPOINT = "https://obs-group-signal-server.onrender.com/token";
const grid = document.getElementById("grid");
const overlayEl = document.getElementById("overlay");
let p5Sketch;

// Create or reuse a video element
function tile(peerId) {
  let v = document.getElementById("v_" + peerId);
  if (!v) {
  const wrap = document.createElement("div");
  wrap.className = "tile";
  v = document.createElement("video");
  v.id = "v_" + peerId;
  v.autoplay = true;
  v.playsInline = true;
  wrap.appendChild(v);
  grid.appendChild(wrap);
  }
  return v;
}

let selectedEmoji = null;

async function join() {
  // fetch token and LiveKit URL from your Render server
  const identity = Math.random().toString(36).slice(2);
  const res = await fetch(`${TOKEN_ENDPOINT}?identity=${identity}`);
  const { token, url } = await res.json();

  const room = new Room({ adaptiveStream: true, dynacast: true });

  // Local publish
  const cam = await createLocalVideoTrack({ resolution: { width: 640, height: 360 } });
  const me = tile(identity);
  me.muted = true;
  cam.attach(me);
  try { await me.play(); } catch {}

  room.on(RoomEvent.TrackSubscribed, async (track, pub, participant) => {
    if (track.kind === "video") {
      const v = tile(participant.identity);
      track.attach(v);
      v.muted = true; // video element muted is fine; audio tracks can remain separate
      try { await v.play(); } catch {}
    }
  });

  function removeTile(pid) {
    const v = document.getElementById("v_" + pid);
    if (v && v.parentElement) {
      // remove wrapper entirely to avoid empty grid holes
      const wrap = v.parentElement;
      wrap.parentElement && wrap.parentElement.removeChild(wrap);
    }
  }

  room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
    removeTile(participant.identity);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    removeTile(participant.identity);
  });

  room.on(RoomEvent.ConnectionStateChanged, (s) => {
    console.log("LiveKit state:", s);
  });

  await room.connect(url, token, { autoSubscribe: true });
  await room.localParticipant.publishTrack(cam);

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
    const vid = v.id.startsWith("v_") ? v.id.slice(2) : null;
    if (!vid) return;
    const r = v.getBoundingClientRect();
    const ox = (ev.clientX - r.left) / r.width; // 0..1
    const oy = (ev.clientY - r.top) / r.height; // 0..1
    const payload = JSON.stringify({ type: "emoji", emoji: selectedEmoji, target: vid, ox, oy, t: Date.now() });
    room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: false, topic: "emoji" });
    pushEmojiTarget(selectedEmoji, vid, ox, oy); // local echo
  });

  // Receive data
  room.on(RoomEvent.DataReceived, (payload, participant, maybeTopic) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type === "emoji") {
        if (msg.target) pushEmojiTarget(msg.emoji, msg.target, msg.ox, msg.oy);
        else pushEmoji(msg.emoji);
      }
    } catch {}
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
