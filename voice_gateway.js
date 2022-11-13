import WebSocket from "ws";
import {connect as connectUdp, setSessionDescription} from "./voice.js";
import {voiceReady} from "./bot.js";

let ws;
const metadata = {
    user_id: null,
    server_id: null,
    session_id: null,
    voiceToken: null,
    endpoint: null
}
const protocol = {
    ip: null,
    port: null,
    ssrc: null,
    mode: null
}
let stream;

const opcodes = {}; // voice opcodes, taken from discord source code
opcodes[opcodes.IDENTIFY = 0] = "IDENTIFY";
opcodes[opcodes.SELECT_PROTOCOL = 1] = "SELECT_PROTOCOL";
opcodes[opcodes.READY = 2] = "READY";
opcodes[opcodes.HEARTBEAT = 3] = "HEARTBEAT";
opcodes[opcodes.SELECT_PROTOCOL_ACK = 4] = "SELECT_PROTOCOL_ACK";
opcodes[opcodes.SPEAKING = 5] = "SPEAKING";
opcodes[opcodes.HEARTBEAT_ACK = 6] = "HEARTBEAT_ACK";
opcodes[opcodes.RESUME = 7] = "RESUME";
opcodes[opcodes.HELLO = 8] = "HELLO";
opcodes[opcodes.RESUMED = 9] = "RESUMED";
opcodes[opcodes.VIDEO = 12] = "VIDEO";
opcodes[opcodes.CLIENT_DISCONNECT = 13] = "CLIENT_DISCONNECT";
opcodes[opcodes.SESSION_UPDATE = 14] = "SESSION_UPDATE";
opcodes[opcodes.MEDIA_SINK_WANTS = 15] = "MEDIA_SINK_WANTS";
opcodes[opcodes.VOICE_BACKEND_VERSION = 16] = "VOICE_BACKEND_VERSION";
opcodes[opcodes.CHANNEL_OPTIONS_UPDATE = 17] = "CHANNEL_OPTIONS_UPDATE";

export const setMetadata = (user_id, session_id, {token, guild_id, endpoint}) => {
    metadata.user_id = user_id;
    metadata.server_id = guild_id;
    metadata.session_id = session_id;
    metadata.voiceToken = token;
    metadata.endpoint = endpoint;
}

export const connect = () => {
    ws = new WebSocket(`wss://${metadata.endpoint}/?v=7`);

    ws.on("open", identify);
    ws.on("message", onMessage);
    ws.on("close", (data) => console.log("Voice connection closed", data));
}

const send = (opcode, data) => {
    console.log(" VOICE -> ", opcode, opcodes[opcode], data);
    ws.send(JSON.stringify({op: opcode, d: data}));
}

const identify = () => {
    send(0, {
        server_id: metadata.server_id,
        session_id: metadata.session_id,
        token: metadata.voiceToken,
        user_id: metadata.user_id,
        video: true,
        streams: [{type: "video", rid: "100", quality: 100}]
    });
}

const onMessage = (raw) => {
    const message = JSON.parse(raw.toString());
    const {op: opcode, d: data, t: type, s: sequenceNumber} = message;
    console.log(" VOICE <- ", opcode, opcodes[opcode], data);

    switch (opcode) {
        case opcodes.HELLO:
            startHeartbeatInterval(data.heartbeat_interval);
            break;
        case opcodes.READY: // 2
            const {ip, port, ssrc, modes, streams} = data;
            protocol.ip = ip;
            protocol.port = port;
            protocol.ssrc = ssrc;

            stream = streams.sort((a, b) => b.quality - a.quality)[0];
            connectUdp(ip, port, ssrc, modes);
            break;
        case opcodes.SELECT_PROTOCOL_ACK: // 4
            protocol.mode = data.mode;
            setSessionDescription(data);
            voiceReady();
            break;
    }
}

export const selectProtocol = (address, port, mode, rtc_connection_id) => {
    send(opcodes.SELECT_PROTOCOL, {
        protocol: "udp",
        address, port, mode,
        data: {
            address, port, mode
        },
        codecs: [
            {"name": "opus", "type": "audio", "priority": 1000, "payload_type": 120},
            {"name": "H264", "type": "video", "priority": 1000, "payload_type": 101, "rtx_payload_type": 102, "encode": true, "decode": true},
            {"name": "VP8", "type": "video", "priority": 2000, "payload_type": 103, "rtx_payload_type": 104, "encode": true, "decode": true},
            {"name": "VP9", "type": "video", "priority": 3000, "payload_type": 105, "rtx_payload_type": 106, "encode": true, "decode": true}
        ],
        rtc_connection_uuid: rtc_connection_id
    });
}

export const setSpeaking = (value) => {
    // 1 for normal speaking, 2 for screenshare speaking
    send(opcodes.SPEAKING, {
        speaking: value,
        delay: 0,
        ssrc: protocol.ssrc
    });
}

const sendHeartbeat = () => {
    send(opcodes.HEARTBEAT, Date.now());
}

const startHeartbeatInterval = (interval) => {
    setInterval(sendHeartbeat, interval);
}
