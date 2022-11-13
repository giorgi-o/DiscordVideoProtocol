import {createSocket} from 'dgram';
import libsodium from 'libsodium-wrappers';
// import tweetnacl from 'tweetnacl';
import {selectProtocol} from "./stream_gateway.js";

let socket;
let mode, ssrc, rtc_connection_uuid;
const session = {
    media_session_id: null,
    secret_key: null,
    audio_codec: null,
    video_codec: null
};
let packetNumber = Math.floor(Math.random() * 2 ** 16), timestamp = Math.floor(Math.random() * 2 ** 32);
let nonce = 0, nonceBuffer = Buffer.alloc(24), nonceBuffer2 = Buffer.alloc(24);
// nonceBuffer is connectionData.nonceBuffer, nonceBuffer2 is "nonce" in djs source code

const cloneBuffer = (buf) => {
    const newBuf = Buffer.alloc(buf.length);
    buf.copy(newBuf);
    return newBuf;
}

export const connect = (ip, port, _ssrc, modes) => {
    ssrc = _ssrc;
    mode = selectMode(modes);

    socket = createSocket('udp4');
    socket.connect(port, ip);

    console.log("Connecting to UDP", ip, port);

    socket.on('connect', () => ipDiscovery(ssrc));
    socket.on('message', onMessage);
    socket.on('close', () => console.error("UDP connection closed"));
}

const send = (data) => {
    // console.log(" UDP -> ");
    // printBuffer(data);
    socket.send(data);
}

const printBuffer = (buf, step=20) => {
    for(let i = 0; i < buf.length; i += step) {
        let line = [...buf.slice(i, i + step)];
        let s = "";
        s += line.map(n => n.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(step * 3 - 1, ' ');
        s += " | ";
        s += line.map(n => 32 <= n && n <= 126 ? String.fromCharCode(n) : '.').join('');
        console.log(s);
    }
}

const ipDiscovery = (ssrc) => {
    const discoveryBuffer = Buffer.alloc(74);
    discoveryBuffer.writeUInt16BE(1, 0);
    discoveryBuffer.writeUInt16BE(70, 2);
    discoveryBuffer.writeUInt32BE(ssrc, 4);
    send(discoveryBuffer);
}

const onMessage = (buf) => {
    // console.log(" UDP <- ");
    // printBuffer(buf);

    if(buf.readUInt16BE(0) === 2) { // ip discovery response
        const ip = buf.slice(8, buf.indexOf(0, 8)).toString("utf-8");
        const port = buf.readUInt16BE(buf.length - 2);
        console.log("UDP Connected as", ip, port);

        rtc_connection_uuid = "00000000-0000-4000-0000-000000000000"; // never used again afaik
        selectProtocol(ip, port, mode, rtc_connection_uuid);
    }

    // all other packets are packets from other users, ignore them
}

const selectMode = (modes) => {
    return modes.find(mode => [
        "xsalsa20_poly1305_lite",
        "xsalsa20_poly1305_suffix",
        "xsalsa20_poly1305"
    ].includes(mode));
}

export const setSessionDescription = ({mode: chosenMode, media_session_id, secret_key, audio_codec, video_codec}) => {
    mode = chosenMode;
    session.media_session_id = media_session_id;
    session.secret_key = new Uint8Array(secret_key);
    session.audio_codec = audio_codec;
    session.video_codec = video_codec;
}

let last_sent = 0;
export const sendVideo = (meta, data, packet) => {
    // if(last_sent && Date.now() - last_sent > 10) console.log(`Last video packet sent ${Date.now() - last_sent}ms ago`);

    const homeGrown = createVideoPacket(meta, data, packet);
    send(homeGrown);

    packetNumber++;
    last_sent = Date.now();
}

const createVideoPacket = (meta, data, packet) => {
    const rtpHeader = Buffer.alloc(12);

    let byteOne = packet[0];
    byteOne |= 0b00010000; // turn on the "extension" bit
    rtpHeader.writeUInt8(byteOne, 0);

    let markerBit = packet[1] & 0b10000000;
    let byteTwo = 101 | markerBit; // 101 = payload type for H264
    rtpHeader.writeUInt8(byteTwo, 1);

    rtpHeader.writeUInt16BE(meta.sequenceNum, 2);
    rtpHeader.writeUInt32BE(meta.timestamp, 4);
    rtpHeader.writeUInt32BE(ssrc, 8);

    const encryptedData = Buffer.from(encryptPacket(data));
    return Buffer.concat([rtpHeader, encryptedData]);
}

const encryptPacket = (data) => {
    if (mode === "xsalsa20_poly1305_lite") {
        nonce++;
        nonceBuffer.writeUInt32BE(nonce, 0);
        return [
            libsodium.crypto_secretbox_easy(data, nonceBuffer, session.secret_key),
            // tweetnacl.secretbox(data, nonceBuffer, session.secret_key),
            nonceBuffer.slice(0, 4)
        ];
    }
    else if (mode === "xsalsa20_poly1305_suffix") {
        const random = libsodium.randombytes_buf(24, nonceBuffer);
        // const random = tweetnacl.randomBytes(24);
        return [libsodium.crypto_secretbox_easy(data, random, session.secret_key), random];
        // return [tweetnacl.secretbox(data, random, session.secret_key), random];
    }
    else if (mode === "xsalsa20_poly1305") {
        return [libsodium.crypto_secretbox_easy(data, nonceBuffer2, session.secret_key)];
        // return [tweetnacl.secretbox(data, nonceBuffer2, session.secret_key)];
    }
    console.error("Unknown encryption mode", mode);
}
