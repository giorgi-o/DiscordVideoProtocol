import WebSocket from 'ws';
import {setMetadata as setVoiceMetadata, connect as connectVoice} from "./voice_gateway.js";
import {setMetadata as setStreamMetadata, connect as connectStream, setRtcServerId} from "./stream_gateway.js";


let ws;
let user_id, session_id;
let lastSequenceNumber = null;

const opcodes = {}; // gateway opcodes, taken from discord source code
opcodes[opcodes.DISPATCH = 0] = "DISPATCH";
opcodes[opcodes.HEARTBEAT = 1] = "HEARTBEAT";
opcodes[opcodes.IDENTIFY = 2] = "IDENTIFY";
opcodes[opcodes.PRESENCE_UPDATE = 3] = "PRESENCE_UPDATE";
opcodes[opcodes.VOICE_STATE_UPDATE = 4] = "VOICE_STATE_UPDATE";
opcodes[opcodes.VOICE_SERVER_PING = 5] = "VOICE_SERVER_PING";
opcodes[opcodes.RESUME = 6] = "RESUME";
opcodes[opcodes.RECONNECT = 7] = "RECONNECT";
opcodes[opcodes.REQUEST_GUILD_MEMBERS = 8] = "REQUEST_GUILD_MEMBERS";
opcodes[opcodes.INVALID_SESSION = 9] = "INVALID_SESSION";
opcodes[opcodes.HELLO = 10] = "HELLO";
opcodes[opcodes.HEARTBEAT_ACK = 11] = "HEARTBEAT_ACK";
opcodes[opcodes.CALL_CONNECT = 13] = "CALL_CONNECT";
opcodes[opcodes.GUILD_SUBSCRIPTIONS = 14] = "GUILD_SUBSCRIPTIONS";
opcodes[opcodes.LOBBY_CONNECT = 15] = "LOBBY_CONNECT";
opcodes[opcodes.LOBBY_DISCONNECT = 16] = "LOBBY_DISCONNECT";
opcodes[opcodes.LOBBY_VOICE_STATES_UPDATE = 17] = "LOBBY_VOICE_STATES_UPDATE";
opcodes[opcodes.STREAM_CREATE = 18] = "STREAM_CREATE";
opcodes[opcodes.STREAM_DELETE = 19] = "STREAM_DELETE";
opcodes[opcodes.STREAM_WATCH = 20] = "STREAM_WATCH";
opcodes[opcodes.STREAM_PING = 21] = "STREAM_PING";
opcodes[opcodes.STREAM_SET_PAUSED = 22] = "STREAM_SET_PAUSED";
opcodes[opcodes.REQUEST_GUILD_APPLICATION_COMMANDS = 24] = "REQUEST_GUILD_APPLICATION_COMMANDS";
opcodes[opcodes.EMBEDDED_ACTIVITY_LAUNCH = 25] = "EMBEDDED_ACTIVITY_LAUNCH";
opcodes[opcodes.EMBEDDED_ACTIVITY_CLOSE = 26] = "EMBEDDED_ACTIVITY_CLOSE";
opcodes[opcodes.EMBEDDED_ACTIVITY_UPDATE = 27] = "EMBEDDED_ACTIVITY_UPDATE";
opcodes[opcodes.REQUEST_FORUM_UNREADS = 28] = "REQUEST_FORUM_UNREADS";
opcodes[opcodes.REMOTE_COMMAND = 29] = "REMOTE_COMMAND";

export const connect = () => {
    ws = new WebSocket('wss://gateway.discord.gg/?encoding=json&v=9');

    ws.on('open', authenticate);
    ws.on('message', onMessage);
    ws.on('close', () => console.error("Connection Closed"));
}

export const send = (opcode, data) => {
    console.log("  -> ", opcode, opcodes[opcode], data);
    ws.send(JSON.stringify({op: opcode, d: data}));
}

const authenticate = () => {
    console.log("Authenticating");

    send(2, {
        "token": process.env.token,
        "capabilities": 1021,
        "properties": {
            "os": "Windows",
            "browser": "Discord Client",
            "release_channel": "stable",
            "client_version": "1.0.9006",
            "os_version": "10.0.19044",
            "os_arch": "x64",
            "system_locale": "en-US",
            "client_build_number": 151857,
            "client_event_source": null
        },
        "presence": {
            "status": "online",
            "since": 0,
            "activities": [],
            "afk": false
        },
        "compress": false,
        "client_state": {
            "guild_hashes": {},
            "highest_last_message_id": "0",
            "read_state_version": 0,
            "user_guild_settings_version": -1,
            "user_settings_version": -1,
            "private_channels_version": "0"
        }
    });

}

const onMessage = (raw) => {
    const message = JSON.parse(raw.toString());
    const {op: opcode, d: data, t: type, s: sequenceNumber} = message;

    console.log(" <- ", opcode, opcodes[opcode], type, data, sequenceNumber);
    lastSequenceNumber = sequenceNumber;

    switch (opcode) {
        case opcodes.DISPATCH: // 0
            onDispatch(type, data);
            break;
        case opcodes.HELLO: // 10
            startHeartbeatInterval(data.heartbeat_interval);
            break;
    }
}

const onDispatch = (type, data) => {
    switch (type) {
        case "READY":
            user_id = data.user.id;
            session_id = data.session_id;
            sendVoiceStateUpdate();
            break;
        case "VOICE_SERVER_UPDATE":
            setVoiceMetadata(user_id, session_id, data);
            connectVoice();
            break;
        case "STREAM_CREATE":
            setRtcServerId(data.rtc_server_id);
            break;
        case "STREAM_SERVER_UPDATE":
            setStreamMetadata(user_id, session_id, data);
            connectStream();
            break;
    }
}

const sendVoiceStateUpdate = (guildId=process.env.guild_id, channelId=process.env.channel_id) => {
    send(opcodes.VOICE_STATE_UPDATE, {
        guild_id: guildId,
        channel_id: channelId,
        self_mute: false,
        self_deaf: false,
        self_video: false
    });
}

export const startStream = (guildId=process.env.guild_id, channelId=process.env.channel_id) => {
    send(opcodes.STREAM_CREATE, {
        channel_id: channelId,
        guild_id: guildId,
        preferred_region: "rotterdam",
        type: "guild"
    });
    send(opcodes.STREAM_SET_PAUSED, {
        paused: false,
        stream_key: `guild:${guildId}:${channelId}:${user_id}`
    });
}

const sendHeartbeat = () => {
    send(opcodes.HEARTBEAT, lastSequenceNumber);
}

const startHeartbeatInterval = (interval) => {
    setTimeout(() => {
        sendHeartbeat();
        setInterval(sendHeartbeat, interval);
    }, interval * Math.random());
}
