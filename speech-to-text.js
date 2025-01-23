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

const convertOggToWav = async (oggPath, outputDir) => {
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

const downloadVoice = async(url) => {
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

const downloadAndConvertOggToWav = async (url, outputDir) => {
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

export const transcribe = async(audioUrl) => {
    const wavPath = await downloadAndConvertOggToWav(audioUrl, '/media');
    const whisperAsync = promisify(whisper);

    const whisperParams = {
        language: "vi",
        model: "./whisper/weight/ggml-tiny-vi.bin",
        fname_inp: wavPath,
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

export const transcribeGemini = async(model, audioUrl) => {
    const audioResponse = await fetch(audioUrl);
    const arrayBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    const result = await model.generateContent([
        {
            inlineData: {
                mimeType: "audio/ogg",
                data: base64Audio
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
                            mimeType: "audio/ogg",
                            data: base64Audio
                        },
                    },
                ],
            },
            ],
        },
    });
    console.log(result.response.text());
    console.log(countTokensResult);
};

export const transcribeHf = async(audioUrl) => {
    const audioResponse = await fetch(audioUrl);
    const arrayBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
	const response = await fetch(
		"https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo",
		{
			headers: {
				Authorization: `Bearer ${process.env.HUGGING_FACE_TOKEN}`,
				"Content-Type": "application/json",
			},
			method: "POST",
			body: JSON.stringify({
                inputs: base64Audio
            }),
		}
	);
	const result = await response.json();
    console.log(result);
	return result.text;
};
