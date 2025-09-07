import * as mediasoupClient from "https://esm.sh/mediasoup-client@3";

// --- FIXED WebSocket URL: Render-hosted ---
const WS_URL = "wss://obs-group-signal-server.onrender.com/ws"; // Render WebSocket endpoint

console.log("Connecting to", WS_URL);
const ws = new WebSocket(WS_URL);
const id = Math.random().toString(36).slice(2);

const grid = document.getElementById("grid");

const state = {
  device: null,
  sendTransport: null,
  recvTransport: null,
  consumers: new Map(),
};

// Helper: send JSON
const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const onceMsg = (type) =>
  new Promise((res) => {
    const h = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === type) {
        ws.removeEventListener("message", h);
        res(m);
      }
    };
    ws.addEventListener("message", h);
  });

// Create or reuse a video element
function tile(peerId) {
  let v = document.getElementById("v_" + peerId);
  if (!v) {
    v = document.createElement("video");
    v.id = "v_" + peerId;
    v.autoplay = true;
    v.playsInline = true;
    grid.appendChild(v);
  }
  return v;
}

// Boot
ws.addEventListener("open", async () => {
  console.log("🟢 WebSocket open");

  send({ type: "join", id });
  const joined = await onceMsg("joined");

  // 1. Device
  const device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: joined.routerRtpCapabilities });
  state.device = device;

  // 2. Send transport
  send({ type: "create-send-transport" });
  const tSend = await onceMsg("send-transport-created");
  const sendTransport = device.createSendTransport(tSend);
  state.sendTransport = sendTransport;

  sendTransport.on("connect", ({ dtlsParameters }, cb) => {
    send({ type: "connect-transport", transportId: tSend.id, dtlsParameters });
    onceMsg("transport-connected").then(() => cb());
  });

  sendTransport.on("produce", ({ kind, rtpParameters }, cb) => {
    send({ type: "produce", transportId: tSend.id, kind, rtpParameters });
    onceMsg("produced").then(({ producerId }) => cb({ id: producerId }));
  });

  // 3. Camera
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 360, frameRate: 24 },
    audio: false,
  });
  const localTile = tile("me");
  localTile.muted = true;
  localTile.srcObject = stream;
  await sendTransport.produce({
    track: stream.getVideoTracks()[0],
    // Simulcast encodings for SFU scaling (low/med/high)
    encodings: [
      { maxBitrate: 150_000, scaleResolutionDownBy: 4 },
      { maxBitrate: 450_000, scaleResolutionDownBy: 2 },
      { maxBitrate: 900_000, scaleResolutionDownBy: 1 },
    ],
    codecOptions: { videoGoogleStartBitrate: 1000 },
  });

  send({ type: "save-rtp-capabilities", rtpCapabilities: device.rtpCapabilities });

  // 4. Recv transport
  send({ type: "create-recv-transport" });
  const tRecv = await onceMsg("recv-transport-created");
  const recvTransport = device.createRecvTransport(tRecv);
  state.recvTransport = recvTransport;

  recvTransport.on("connect", ({ dtlsParameters }, cb) => {
    send({ type: "connect-transport", transportId: tRecv.id, dtlsParameters });
    onceMsg("transport-connected").then(() => cb());
  });
});

// Incoming WS messages
ws.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "new-producer" && msg.kind === "video") {
    send({
      type: "consume",
      producerId: msg.producerId,
      rtpCapabilities: state.device.rtpCapabilities,
      transportId: state.recvTransport.id,
    });
    const c = await onceMsg("consumed");
    const consumer = await state.recvTransport.consume({
      id: c.id,
      producerId: c.producerId,
      kind: c.kind,
      rtpParameters: c.rtpParameters,
    });
    state.consumers.set(consumer.id, consumer);

    const v = tile(msg.peerId);
    const s = new MediaStream();
    s.addTrack(consumer.track);
    v.srcObject = s;

    send({ type: "resume", consumerId: consumer.id });
  }

  if (msg.type === "emoji" && msg.from !== id) {
    // TODO: render emoji overlay here
    console.log("🎉 Emoji from", msg.from, msg.emoji);
  }

  if (msg.type === "producer-closed") {
    // Remove tile and associated consumer if any
    const v = document.getElementById("v_" + msg.peerId);
    if (v && v.parentElement) v.parentElement.removeChild(v);
    for (const [cid, consumer] of state.consumers) {
      if (consumer.producerId === msg.producerId) {
        try { consumer.close(); } catch {}
        state.consumers.delete(cid);
      }
    }
  }
});

// Emoji sending
const EMOJI = ["🥳", "❤️", "🔥", "😂", "🤩"];
window.addEventListener("keydown", (e) => {
  const i = parseInt(e.key, 10);
  if (i >= 1 && i <= EMOJI.length) {
    send({ type: "emoji", emoji: EMOJI[i - 1] });
  }
});
