import { Room, RoomEvent, createLocalVideoTrack, createLocalAudioTrack, ConnectionState } from "https://esm.sh/livekit-client@2";

const TOKEN_ENDPOINT = "https://obs-group-signal-server.onrender.com/token";
const grid = document.getElementById("grid");

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

async function join() {
  // fetch token and LiveKit URL from your Render server
  const identity = Math.random().toString(36).slice(2);
  const res = await fetch(`${TOKEN_ENDPOINT}?identity=${identity}`);
  const { token, url } = await res.json();

  const room = new Room({ adaptiveStream: true, dynacast: true });

  // Local publish
  const cam = await createLocalVideoTrack({ resolution: { width: 640, height: 360 } });
  const me = tile("me");
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

  room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
    const v = document.getElementById("v_" + participant.identity);
    if (v) {
      try { track.detach(v); } catch {}
    }
    if (v && v.parentElement) v.parentElement.removeChild(v);
  });

  room.on(RoomEvent.ConnectionStateChanged, (s) => {
    console.log("LiveKit state:", s);
  });

  await room.connect(url, token, { autoSubscribe: true });
  await room.localParticipant.publishTrack(cam);
}

join().catch((e) => console.error(e));
