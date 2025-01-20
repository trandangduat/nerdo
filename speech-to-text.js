import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { whisper } = require("./whisper/addon.node.node");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

export const convertOggToWav = async (oggPath, outputDir) => {
    const wavPath = path.join(path.join(__dirname, outputDir), `${path.basename(oggPath, '.ogg')}.wav`);
    console.log(wavPath);
    return new Promise((resolve, reject) => {
        ffmpeg(oggPath)
            .outputOptions('-ar 16000')
            .save(wavPath)
            .on('end', () => resolve(wavPath))
            .on('error', (err) => reject(err));
    });
};

export const downloadAndConvertOggToWav = async (url, outputDir) => {
    const oggPath = path.join(__dirname, '/media/temp.ogg');
    console.log(oggPath)
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(oggPath);
        response.data.pipe(writer);
        writer.on('finish', async () => {
            try {
                const wavPath = await convertOggToWav(oggPath, outputDir);
                fs.unlinkSync(oggPath); // Remove the temporary OGG file
                resolve(wavPath);
            } catch (err) {
                reject(err);
            }
        });
        writer.on('error', reject);
    });
};

export const transcribe = async(wav_path) => {
    const whisperAsync = promisify(whisper);

    const whisperParams = {
        language: "auto",
        model: "./whisper/weight/ggml-tiny.bin",
        fname_inp: wav_path,
        use_gpu: false,
        flash_attn: false,
        no_prints: true,
        comma_in_time: false,
        translate: false,
        no_timestamps: false,
        audio_ctx: 0,
    };

    const result = await whisperAsync(whisperParams);
    let str = "";

    result.forEach((segment, index) => {
        str += segment[2];
    });

    return str;
};
