import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { whisper } = require("./whisper/addon.node.node");

const { promisify } = require("util");

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
