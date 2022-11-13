import dotenv from 'dotenv';
dotenv.config();

import {connect} from './gateway.js';
import {sendAudio} from "./voice.js";
import {setSpeaking} from "./voice_gateway.js";
import {spawn} from "child_process";
import {sendVideo} from "./stream.js";
import {createVideoStream} from "./video_packet.js";

/*let last = 0;
const loop = () => {
    console.log(Date.now() - last);
    last = Date.now();
}
regularInterval(loop, 20);*/

export const voiceReady = () => {
    console.log("Voice ready, starting stream");
    // startStream();
    playAudio()
}

export const streamReady = () => {
    console.log("Stream ready, sending video");
    playVideo();
}

// const file = () => fs.createReadStream("happy.mp4");
export const playAudio = () => {

    const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-re",
        "-i", "happy.webm",
        "-ac", "2",
        "-ar", "48000",
        "-acodec", "libopus",
        "-map", "0:a",
        "-f", "data",
        // "-f", "opus",
        // "-af", "arealtime",
        "-vn",
        "-"
    ]);
    ffmpeg.stderr.pipe(process.stderr);

    // const demuxer = new prism.opus.OggDemuxer();
    // ffmpeg.stdout.pipe(demuxer);

    /*const sendChunk = () => {
        // const chunk = demuxer.read();
        const chunk = ffmpeg.stdout.read();
        if(chunk) {
            if(chunk.length) sendAudio(chunk);
            else console.log("No more audio!");
        }
    }

    regularInterval(sendChunk, 20);*/

    ffmpeg.stdout.on("data", (chunk) => {
        // console.log("chunk", chunk.length);
        if(chunk.length < 5) return;
        sendAudio(chunk);
    });

    setSpeaking(true);

    // =========================

    /*const demuxer = new prism.opus.OggDemuxer();
    file().pipe(demuxer);

    const sendChunk = () => {
        const chunk = demuxer.read();
        if(chunk) {
            if(chunk.length) sendAudio(chunk);
            else console.log("No more audio!");
        }
    }

    regularInterval(sendChunk, 20);

    setSpeaking(true);*/

    // ========================


    /*const audioResource = createAudioResource(file(), {inputType: prism.opus.OpusStream});

    const sendChunk = () => {
        const chunk = audioResource.read();
        if(chunk) {
            if(chunk.length) sendAudio(chunk);
            else console.log("No more audio!");
        }
    }

    regularInterval(sendChunk, 20);

    setSpeaking(true);*/


    // ==================

    /*// const audioResource = createAudioResource(file());
    // const encoder = new opus.Encoder({rate: 48000, channels: 2, frameSize: 960});
    // const demuxer = new opus.OggDemuxer();
    // file().pipe(demuxer);
    // encoder.pipe(fs.createWriteStream("output.audio"))

    /!*const ffmpeg = spawn("ffmpeg", [
        "-analyzeduration", "0",
        "-loglevel", "0",
        "-i", "happy.opus",
        "-acodec", "libopus",
        "-f", "opus",
        "-ar", "48000",
        "-ac", "2",
        "-"
    ]);
    ffmpeg.stderr.pipe(process.stderr);
    ffmpeg.on("spawn", () => console.log("ffmpeg spawned"));
    ffmpeg.on("error", (err) => console.error(err));
    ffmpeg.on("exit", (code) => console.log("ffmpeg exited with code", code));*!/
    /!*const ffmpeg = new prism.FFmpeg({
        args: [
            "-analyzeduration", "0",
            "-loglevel", "0",
            "-i", "happy.opus",
            "-acodec", "libopus",
            "-f", "opus",
            "-ar", "48000",
            "-ac", "2",
            "-"
        ]
    });*!/

    // const demuxer = new opus.OggDemuxer();
    // ffmpeg.stdout.pipe(demuxer);

    // ffmpeg.once('readable', () => console.log("ffmpeg readable"));
    // const audioResource = createAudioResource(ffmpeg);
    // const audioResource = createAudioResource(fs.createReadStream("happy.opus"));
    // const audioResource = createAudioResource("happy.opus");
    // ffmpeg.stdout.pipe(fs.createWriteStream("output.audio"));

    /!*setTimeout(() => {
        setSpeaking(true);
        let buf1 = demuxer.read();
        let buf2 = audioResource.read();
        debugger;
    }, 1000);
*!/
    // setSpeaking(true);
    // const audioFileStream = fs.createWriteStream("output.audio");

    /!*let lastIteration;
    setInterval(() => {
        console.log(`Time since last iteration: ${Date.now() - lastIteration}ms`);

        let buf = audioResource.read();
        // let buf = demuxer.read();
        if(!buf) return;
        if(buf.length) sendAudio(buf);
        else console.error("No more audio");
        audioFileStream.write(buf);

        lastIteration = Date.now();
    }, 20);*!/

    const audio = fs.readFileSync("music.opus");
    setTimeout(() => {
        setSpeaking(true)
        sendAudio(audio);
    }, 2000);
    */
}

export const playVideoOld = () => {
    const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-re",
        "-i", "happy.webm",
        /*"-vcodec", "libx264",
        "-map", "0:v",
        // "-f", "data",
        "-f", "rawvideo",
        // "-f", "h264",
        // "-vf", "arealtime",*/

        "-map", "0:v",

        '-an',
        '-c:v', 'libx264',
        '-b:v', '4000',
        '-bufsize', '1M',
        '-pix_fmt', 'yuv420p',
        '-threads', '2',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',

        // '-f', 'rtp',
        "-f", "data",
        // "-f", "rawvideo",
        // "-f", "h264",

        "-"
    ]);
    ffmpeg.stderr.pipe(process.stderr);

    ffmpeg.stdout.on("data", (chunk) => {
        console.log("chunk", chunk.length);
        sendVideo(chunk);
    });

    // setSpeaking(true);
}

export const playVideo = () => {
    createVideoStream();
}

connect();
