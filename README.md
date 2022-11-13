## Failed attempts at reverse engineering Discord's video protocol

I wanted to make a Discord selfbot that could join a voice channel, start a stream, and play any video or livestream to everybody else in the channel. The main reason I wanted to do this is for watching esports broadcasts with friends, where if we all launched our separate twitch tabs there was often a delay and we would never be perfectly synchronised. Plus, it seemed like a fun rewarding project.

I didn't manage in the end, but I hope someone motivated enough can pick up where I left off.

## My plan

I wanted to make a standalone, bare metal node.js program with as few dependencies as possible. Here are the steps I had in mind:

1. Able to connect to Discord's gateway and login using an access token
2. Able to join a voice channel and play some audio
3. Able to start a stream and play some video

I managed the first two, mostly thanks to the fact that they're documented both [by discord](https://discord.dev) and in [discord.js](https://github.com/discordjs/discord.js)'s source code, as well as other places around the internet.

## My methodology

Most of the info was collected from the discord app itself, using devtools. They can be opened using Ctrl Shift I, although you have to enable them first (google is your friend).

To see Gateway events, the easiest way is to enable discord dev mode, and enable "logging gateway events to the console". Since the method for enabling dev mode changes semi-frequently, I won't put it here, but you can find it with some clever searching.

I created a new discord account, since my main account was in many servers and the gateway events I was interested in were being drowned out by all the other events. I then installed Discord Canary and logged in there in order to have two instances of Discord open at once.

## My findings

I won't go into the specific implementation-level details, that's what the code is for. I'll instead focus on the overview of how the process works.

### The well known stuff

I won't cover the gateway since that is quite easy to figure out, and is extensively documented already. The logic can be found in gateway.js.

When you connect to a voice channel, you send a `4 VOICE_STATE_UPDATE` message over the gateway, with the channel and guild ID of the voice channel. Discord will send back a `DISPATCH VOICE_SERVER_UPDATE` containing the domain and port of the voice server you should connect to, usually of the format `rotterdam1234.discord.gg:443`.

You then open a WebSocket connection to that address, this is the voice gateway. You should append a version number to the address, so you should connect to `wss://rotterdam1234.discord.gg:443?v=X`. Discord docs say that the latest voice gateway version is 4, although the desktop client seems to be on version 7 at the time of writing.

Over the voice gateway, discord gives you the IP address and port of the actual voice server, as well as a list of encryption modes to choose from. The desktop client chooses the first of the list, `aead_aes256_gcm_rtpsize`. I'm not a cryptography expert, and lower down the list are the well-known and well-documented ones i.e. the `xsalsa20_poly1305` family, so in my implementation I chose to use those instead.

<details>
<summary>How to force the desktop client to use xsalsa20_poly1305_lite</summary>

Open devtools, press Ctrl Shift F and search for `xsalsa20_poly1305`. Click on the result, and use chromium's code formatter (bottom left) to make the code a bit more readable.

You should end up looking at a function that goes something like this:

```js
o.chooseEncryptionMode = function(e, t) {
    var n = !0
      , r = !1
      , o = void 0;
    try {
        // ...a bunch of code
    } finally {
        try {
            n || null == a.return || a.return()
        } finally {
            if (r)
                throw o
        }
    }
    return "xsalsa20_poly1305"
}
```

(The actual code will change every time Discord releases an update, but you should be looking for the `chooseEncryptionMode` function.)

Put a breakpoint on the first line of the function. Right click on the breakpoint and press edit. Then paste the following:

```js
(e = ["xsalsa20_poly1305_lite"]) && false
```

Replace `e` with the name of the first argument of the function.

That should basically trick Discord into thinking that it's the only encryption mode that the server proposed to it. You may have to keep devtools open for the breakpoint to keep injecting the code.

</details>

At this point, you connect to the voice server over UDP, and perform an IP discovery request. Discord will send you back your public IP address and port. This is documented at the bottom of [this page](https://discord.com/developers/docs/topics/voice-connections#ip-discovery).

Back to the voice gateway, you send a `1 SELECT_PROTOCOL` message containing the chosen encryption mode, your public IP/port, and a list of audio/video codecs that you can use. The desktop client can apparently do opus for audio, and H264/VP8/VP9 for video.

Finally, Discord sends you a `4 SELECT_PROTOCOL_ACK` message containing the chosen audio/video codec, the encryption mode, and the encryption key that you should use to encrypt all media data. You can now start sending opus audio data to the server.

The packet structure is detailed on discord's docs [here](https://discord.com/developers/docs/topics/voice-connections#encrypting-and-sending-voice), but I found [discord.js' source code](https://github.com/discordjs/discord.js/blob/main/packages/voice/src/networking/Networking.ts#L556) to be much more useful. You're supposed to send opus frames every 20ms. If you send more than one at a time, discord will play them in fast motion, because it thinks that you had a connection hiccup.

You're supposed to setup a heartbeat interval, both for the gateway and the voice gateway, otherwise Discord will stop transmitting your voice data after 60 seconds. I won't go into that here however.

At this point that you can start a screen-sharing stream, and this is where we enter undocumented territory.

### The video stuff

You start a stream by sending a `18 STREAM_CREATE` to the gateway, followed by a `22 STREAM_SET_PAUSED`. The server will send back three dispatch events: `STREAM_CREATE` and `VOICE_STATE_UPDATE` to tell the UI to update, and `STREAM_SERVER_UPDATE` which mirrors the `VOICE_SERVER_UPDATE`, giving you the address to connect to a separate voice gateway. I'll call it the stream gateway from now on, since it's only used to manage the stream.

The stream gateway connection process is pretty much almost the same as the voice gateway, except that before actually sending the video data you need to send an additional `12 VIDEO` message detailing the resolution, fps and bitrate of the video you're about to send.

For those who didn't know, Discord doesn't enforce bitrate or resolution on either voice chat or screen sharing. That means that you could very well send 9999kb/s audio and 8K60 video, and Discord will forward it to everyone without complaining. Although if you're thinking of doing so, consider that it's a really good way to speedrun getting banned.

I was hoping that sending video would have the same packet structure as sending audio, and that I could reuse the same code, but that turned out to not be the case.

To analyse the audio/video data sent by Discord, I used Wireshark since the traffic isn't SSL encrypted.

<details>
<summary>How to filter Discord traffic in Wireshark, the simple way</summary>

Open the voice debug panel by clicking on the green "Voice connected" text in Discord, then on "Debug".

On the left, you should see several "Transport" tabs. The one at the top is for audio, and there will be another one for each stream that you're watching and one for your stream.

At the bottom of the Transport tab, you should see a "hostname". Copy it, and perform a DNS lookup using `nslookup [hostname].discord.gg` in the command line. That should give you the IP of the voice server you're connected to.

Back in Wireshark, use the filter `ip.addr == [the ip]`. You should see all the traffic to and from the Discord voice server.

</details>

I ended up writing a really simple Wireshark Lua plugin to make my life 10% easier. It only properly parses the IP discovery requests/responses, and tell wireshark that any other UDP traffic between the ports 50000 and 65535 should be interpreted as RTP data. It's not complete, but it's definitely helpful.

This doesn't fully work as it turns out that Discord's voice/video traffic doesn't fully adhere to the RTP spec. This is intentional by them in order to save bandwidth by any data that they don't need.

If you are using my Wireshark plugin, you can type "discord" in the filter bar to only see Discord traffic. For packets labelled RTP, look at the "Payload type" field: 120 means opus audio, 101 means H264 video and 102 means RTX video. I'm not fully sure what RTX refers to, but I'm assuming it stands for "retransmission" and follows [this RFC spec](https://datatracker.ietf.org/doc/html/rfc4588) or some variant of it.

The Discord client opens two UDP sockets, one for the actual voice/video data, and one for "rtx". Something I found out is that if you start a stream, Discord doesn't start sending any video data until someone starts watching it. It makes sense when you think about it, there's no point encoding and sending video data if no one is watching the stream. Although curiously, this isn't the case for audio, Discord still sends it even if you're the only one in the voice channel.

## My progress

The main issue is that Discord doesn't tell you where you're wrong. You either see the video data on the receiving end, or you don't. And if you don't, you can only guess as to what you're doing wrong. And so far, I can only see a "stream loading" screen. I might be one line of code away from getting it right, or I might only be 50% of the way there. I have no idea.

### My implementation

Currently, my code is able to join a voice channel and play some audio, as well as launch a stream. I'm pretty sure the only thing left is to find out what exactly to send to Discord to make it recognise the video data I'm sending. If you want to give it a shot, the code that builds the video packet is `createVideoPacket()` in `stream.js` line 106.

It is written in pure javascript, and only has 3 dependencies: libsodium-wrappers to handle the xsalsa20_poly1305 encryption, ws to connect to websockets, and dotenv.

To use it, just put the token of a user account (not a bot) in the .env file, along with a guild ID and channel ID. Make sure FFmpeg is in your PATH or in this folder.

You need to have a file called `happy.webm` in this folder, as that is what it will try to play. I used the video clip of Happy by Pharell Williams for testing, just because I had it in my head at the time, and I thought it would be fitting to hear it once I had finally got it working. To quickly download it using yt-dlp, run the command

```bash
yt-dlp https://www.youtube.com/watch?v=ZbZSe6N_BXs -o happy.webm
```

Finally, install dependencies using `npm i` and run it using `node bot.js`. It should join the voice channel you specified and start a stream.

If you want it to play audio instead, open `bot.js`, comment out `startStream()` and uncomment `playAudio()` line 20.

Also if you're going to look around my code, please ignore the many lines of comments I couldn't be asked to remove, since I don't know how much of it is still valuable.


### Possible ways forward

The obvious way would be to figure out what my code is doing wrong and fix it. Easier said than done. I've stared at Wireshark data for ages and still have no idea.

One reason for that is that the Wireshark plugin can only show the encrypted video data, it can't decrypt it because the plugin is written in Lua. Most Wireshark plugins are written in C, and if this one were, it would allow it to connect to libsodium and decrypt the data in front of our eyes. From there we could pass it into ffmpeg and see what it makes of it. It could also be used to properly make sense of Discord's custom RTP header format.

Another possible lead is that the actual code responsible for doing all the voice/video encoding is located in a C++ node addon called `discord_voice.node` in Discord's install directory. We could either try and decompile it using Ghidra and see where that takes us, or we could try and just `require` it into node.js code and use it from there.

Finally, the browser version of Discord actually uses plain old WebRTC to use voice and screenshare, and since it's all in a browser, all the code should be in plain JS, albeit minified - but it's still better than compiled C++. So if nothing else works, that's always an option.

## References, useful links and acknowledgements

- [The official Discord docs](https://discord.com/developers/docs/topics/voice-connections), as that is where anyone should start
- [The discord.js source code](https://github.com/discordjs/discord.js/tree/main/packages/voice/src)
- [hydro-bot](https://github.com/aidangoettsch/hydro-bot/) by [aidangoettsch](https://github.com/aidangoettsch) for attempting the same thing as me, only two years earlier. He took a slightly different approach, using the Discord's Webcam functionality instead of screen sharing, and modifies discord.js instead of starting from scratch (back then discord.js worked with selfbots). Unfortunately Discord seem to have changed their protocol since then, as it no longer works. If you want to give it a go, you should use [this commit](https://github.com/aidangoettsch/hydro-bot/commit/c7a3ad465a934dc69f7c92485b5e2926bc00f603) to avoid having to compile OBS.
- [This official Discord blog post](https://discord.com/blog/how-discord-handles-two-and-half-million-concurrent-voice-users-using-webrtc) that gives a bunch of useful info on how Discord voice works
- [This excellent tutorial series](https://mika-s.github.io/wireshark/lua/dissector/2017/11/04/creating-a-wireshark-dissector-in-lua-1.html) on how to write a Lua Wireshark dissector
