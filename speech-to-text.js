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
const ffmpeg = require('fluent-ffmpeg');
const FormData = require('form-data');

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

export const downloadVoice = async(url) => {
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
        writer.on('finish', () => resolve(oggPath));
        writer.on('error', reject);
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
        language: "en",
        model: "./whisper/weight/ggml-base.bin",
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

export const transcribeGemini = async(model, audio_url) => {
    console.log(audio_url);
    const oggPath = path.join(__dirname, '/media/temp.ogg');
    console.log(oggPath)
    const response = await axios({
        url: audio_url,
        method: 'GET',
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(oggPath);
        response.data.pipe(writer);
        writer.on('finish', async () => {
            try {
                const base64Buffer = fs.readFileSync(oggPath);
                const base64AudioFile = base64Buffer.toString("base64");
                const result = await model.generateContent([
                    {
                        inlineData: {
                            mimeType: "audio/ogg",
                            data: base64AudioFile
                        }
                    },
                    { text: "Generate a transcript of the speech." },
                ]);
                const countTokensResult = await model.countTokens({
                    generateContentRequest: {
                        contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: "audio/wav",
                                        data: base64AudioFile
                                    },
                                },
                            ],
                        },
                        ],
                    },
                });
                console.log(result.response.text());
                console.log(countTokensResult);
                fs.unlinkSync(oggPath); // Remove the temporary OGG file
                resolve(result.response.text());
            } catch (err) {
                reject(err);
            }
        });
        writer.on('error', reject);
    });
};

export const transcribe3 = async (filePath) => {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('temperature', '0.0');
    formData.append('temperature_inc', '0.2');
    formData.append('response_format', 'json');

    try {
        const response = await axios.post('http://127.0.0.1:8080/inference', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    } catch (error) {
        throw new Error(`Error in transcribe3: ${error.message}`);
    }
};
