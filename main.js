const SIGNAL_SERVER = "wss://obs-group-signal-server.onrender.com";
const socket = new WebSocket(SIGNAL_SERVER);
let socketReady = false;

const clientId = Math.random().toString(36).slice(2);
const SEND_INTERVAL = 300;
let lastSent = 0;

let video, canvas;
let selectedEmoji = "🥳";
const EMOJI_CHOICES = ["🥳", "❤️", "🔥", "😂", "🤩"];

const myEmojis = [];
const peerEmojis = {};

socket.addEventListener("open", () => {
  console.log("🟢 WebSocket connected");
  socketReady = true;
});

socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "image" && msg.id !== clientId) {
    let img = document.getElementById("img_" + msg.id);
    if (!img) {
      img = document.createElement("img");
      img.id = "img_" + msg.id;
      document.getElementById("groupView").appendChild(img);
    }
    img.src = msg.data;
  }

  if (msg.type === "emoji" && msg.id !== clientId) {
    if (!peerEmojis[msg.id]) peerEmojis[msg.id] = [];
    peerEmojis[msg.id].push(createFloatingEmoji(msg.x, msg.y, msg.emoji));
  }
});

function setup() {
  canvas = createCanvas(320, 240);
  canvas.parent(document.body);

  video = createCapture(VIDEO, () => {
    console.log("📷 Camera ready");
  });
  video.size(320, 240);
  video.hide();

  textAlign(CENTER, CENTER);
  textSize(28);
}

function draw() {
  if (!video || !video.loadedmetadata) return;

  background(0);
  image(video, 0, 0, width, height);

  updateAndDrawEmojis(myEmojis);
  Object.values(peerEmojis).forEach(peerList => {
    updateAndDrawEmojis(peerList);
  });

  const now = Date.now();
  if (now - lastSent >= SEND_INTERVAL && canvas && socket.readyState === WebSocket.OPEN) {
    try {
      const dataUrl = canvas.elt.toDataURL("image/jpeg", 0.6);
      socket.send(JSON.stringify({ type: "image", id: clientId, data: dataUrl }));
      lastSent = now;
    } catch (err) {
      console.warn("⚠️ toDataURL failed:", err);
    }
  }
}

function mousePressed() {
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    const newEmoji = createFloatingEmoji(mouseX, mouseY, selectedEmoji);
    myEmojis.push(newEmoji);

    socket.send(JSON.stringify({
      type: "emoji",
      id: clientId,
      x: mouseX,
      y: mouseY,
      emoji: selectedEmoji
    }));
  }
}

function keyPressed() {
  const keyIndex = parseInt(key);
  if (keyIndex >= 1 && keyIndex <= EMOJI_CHOICES.length) {
    selectedEmoji = EMOJI_CHOICES[keyIndex - 1];
    console.log(`🎯 Selected emoji: ${selectedEmoji}`);
  }
}

function createFloatingEmoji(x, y, emoji) {
  return {
    emoji,
    x,
    y,
    startTime: millis(),
    lifespan: 4500, // ⏳ longer lifespan: 4.5 seconds
    yOffset: 0,
    alpha: 255
  };
}

function updateAndDrawEmojis(emojiList) {
  const now = millis();

  for (let i = emojiList.length - 1; i >= 0; i--) {
    const e = emojiList[i];
    const age = now - e.startTime;

    if (age > e.lifespan) {
      emojiList.splice(i, 1);
      continue;
    }

    // 👣 Animate: move up more, fade slower
    const drift = map(age, 0, e.lifespan, 0, -80); // ⬆️ float farther
    const fade = map(age, 0, e.lifespan, 255, 0);  // 🌫️ fade slower

    push();
    fill(255, fade);
    noStroke();
    text(e.emoji, e.x, e.y + drift);
    pop();
  }
}
