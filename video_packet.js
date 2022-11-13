import dgram from "dgram";
import { spawn } from 'child_process';
import {sendVideo} from "./stream.js";
import {setSpeaking} from "./stream_gateway.js";

export const createVideoStream = () => {
    const {server, address, port} = createUdpServer();

    const ffmpeg = spawnFFmpeg(address, port);

    server.on('message', (msg, rinfo) => {
        processFFmpegPacket(msg);
        // ffmpeg.kill();
    });

    setSpeaking(true);
}

const createUdpServer = () => {
    const server = dgram.createSocket('udp4');
    server.on('error', (err) => {
        console.error("ffmpeg udp server error!");
        console.error(err);
    });

    const address = "127.0.0.2";
    const port = 41236;

    server.bind(port, address, () => {
        console.log("ffmpeg udp server listening on port", port);
    });

    return {server, address, port};
}

const spawnFFmpeg = (address, port) => {
    const ffmpeg = spawn("ffmpeg", [
        "-y", "-re",
        "-i", "happy.webm",

        // "-map", "0:v",

        '-an',
        '-c:v', 'libx264',
        '-b:v', '4000',
        '-bufsize', '1M',
        '-pix_fmt', 'yuv420p',
        '-threads', '2',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',

        "-vf", "scale=1280:720",
        "-r", "30",

        "-preset", "ultrafast",
        "-tune", "zerolatency",

        // "-sdp_file", "saved_sdp_file",

        "-f", "rtp",
        `rtp://${address}:${port}/?pkt_size=1400`
        // "happy2.mp4"
    ]);
    ffmpeg.stderr.pipe(process.stderr);
    return ffmpeg;
}

const processFFmpegPacket = (packet) => {
    const firstByte = packet[0];
    const ssrc = packet.readUInt32BE(8);

    // taken from hydro-bot
    const meta = {
        version: firstByte >> 6,
        padding: !!((firstByte >> 5) & 1),
        extension: !!((firstByte >> 4) & 1),
        csrcCount: firstByte & 0b1111,
        payloadType: packet[1] & 0b1111111,
        marker: packet[1] >> 7,
        sequenceNum: packet.readUInt16BE(2),
        timestamp: packet.readUInt32BE(4),
        ssrc,
        data: packet.slice(12),
    };

    sendVideo(meta, meta.data, packet);
}

