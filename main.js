const SIGNAL_SERVER = "wss://obs-group-signal-server.onrender.com";
const socket = new WebSocket(SIGNAL_SERVER);
const video = document.getElementById("localVideo");
const canvas = document.getElementById("snapshot");
const ctx = canvas.getContext("2d");
const groupView = document.getElementById("groupView");
const clientId = Math.random().toString(36).slice(2);

let lastSent = 0;
const SEND_INTERVAL = 300; // milliseconds

socket.addEventListener("open", () => {
  console.log("🟢 WebSocket connected");
});

socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "image" && msg.id !== clientId) {
    let img = document.getElementById("img_" + msg.id);
    if (!img) {
      img = document.createElement("img");
      img.id = "img_" + msg.id;
      img.style.maxWidth = "30%";
      img.style.margin = "0.5em";
      groupView.appendChild(img);
    }
    img.src = msg.data;
  }
});

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    console.log("📷 Camera started");

    const sendFrame = () => {
      const now = Date.now();
      if (now - lastSent < SEND_INTERVAL) {
        requestAnimationFrame(sendFrame);
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) {
        requestAnimationFrame(sendFrame);
        return;
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      socket.send(JSON.stringify({ type: "image", id: clientId, data: dataUrl }));
      lastSent = now;

      requestAnimationFrame(sendFrame);
    };

    requestAnimationFrame(sendFrame);

  } catch (err) {
    console.error("🚫 Camera error:", err);
  }
}

startCamera();
