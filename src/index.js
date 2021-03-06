require('dotenv').config();

const Discord = require('discord.js');
const client = new Discord.Client();
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient({
  credentials: {
    private_key: process.env.GOOGLE_APPLICATION_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_APPLICATION_CLIENT_EMAIL,
  }
});
const { Readable } = require('stream');

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xF8, 0xFF, 0xFE]));
    this.destroy();
  }
}

client.on('message', async msg => {
  try {
    if (msg.content === 'ping') {
      if (msg.member.voice.channel) {
        console.log(`${msg.member.user.username} summoned me to ${msg.member.voice.channel.name}`);
        const connection = await msg.member.voice.channel.join();
        const receiver = connection.receiver;

        connection.play(new Silence(), { type: 'opus' }); // https://github.com/discordjs/discord.js/issues/2929#issuecomment-458584532
        connection.on('speaking', async (user, speaking) => {
          if (speaking.bitfield) {
            console.log(`${user.username} started speaking`);
            const audioStream = receiver.createStream(user, { mode: 'pcm' });

            const speechRequest = {
              config: {
                encoding: 'LINEAR16',
                sampleRateHertz: 48000,
                languageCode: 'en-US',
              }
            };

            const recognizeStream = speechClient.streamingRecognize(speechRequest)
            .on('data', async response => {
              const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join('\n')
                .toLowerCase()
              console.log(`${user.username} said "${transcription}"`)
              if (transcription.includes('downton abbey')) {
                const members = await msg.guild.members.fetch();
                const talkingMember = members.find(m => m.user.id === user.id);
                await talkingMember.kick('Downton abbey no no')
              }

            });

            const convertTo1ChannelStream = new ConvertTo1ChannelStream()

            audioStream.pipe(convertTo1ChannelStream).pipe(recognizeStream)
        
            audioStream.on('end', async () => {
              console.log('audioStream end')
            })
          }
        });
      } else {
        await msg.reply("You must be in a voice channel to summon me!");
      }
    }
  } catch (e) {
    console.log("Well shit",e);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);


// The below code is shamelessly copied from https://refruity.xyz/writing-discord-bot/
// I plan on moving this out. Please don't look at the git history and see this, because hopefully, in time,
// this will be located in a module somewhere and tucked away from all the pretty code :)
const { Transform } = require('stream')

function convertBufferTo1Channel(buffer) {
  const convertedBuffer = Buffer.alloc(buffer.length / 2)

  for (let i = 0; i < convertedBuffer.length / 2; i++) {
    const uint16 = buffer.readUInt16LE(i * 4)
    convertedBuffer.writeUInt16LE(uint16, i * 2)
  }

  return convertedBuffer
}

class ConvertTo1ChannelStream extends Transform {
  constructor(source, options) {
    super(options)
  }

  _transform(data, encoding, next) {
    next(null, convertBufferTo1Channel(data))
  }}
