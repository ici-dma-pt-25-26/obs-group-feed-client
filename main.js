const SIGNAL_SERVER = "wss://obs-group-signal-server.onrender.com"; // your server
const socket = new WebSocket(SIGNAL_SERVER);
const video = document.getElementById("localVideo");
const canvas = document.getElementById("snapshot");
const ctx = canvas.getContext("2d");
const groupView = document.getElementById("groupView");
const clientId = Math.random().toString(36).slice(2); // Simple ID for now

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

    setInterval(() => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      socket.send(JSON.stringify({ type: "image", id: clientId, data: dataUrl }));
    }, 500); // send every 0.5s
  } catch (err) {
    console.error("🚫 Camera error:", err);
  }
}

startCamera();
