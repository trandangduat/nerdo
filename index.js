import TelegramBot from "node-telegram-bot-api";
import { scheduleJob } from "node-schedule";
import { createReminder, createUser, deleteReminder, findUser, getAllReminders, getAllUserTimezoneOffset, getReminder, getReminders, updateReminder, updateReminderNotifiedStatus, updateUserTimezoneOffset } from "./db_op.js";
import { parseReminder, formatTime, toReminderString, removeBeginningMention, escapeMarkdown, hourToMs, minuteToMs } from "./utils.js";
import * as BOT_MSG from "./bot_msg.js";
import Database from "better-sqlite3";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribe, transcribeGemini, transcribeHf } from "./speech-to-text.js";

const connectToDatabase = (dbFile) => {
    const db = new Database(dbFile, { verbose: console.log });
    db.pragma('journal_mode = WAL');
    const migration = fs.readFileSync('db.sql', 'utf8');
    db.exec(migration);
    return db;
}

const sendReminder = (chatId, reminderId, content) => {
    bot.sendMessage(chatId, content);
    updateReminderNotifiedStatus(db, reminderId, 1);
};

const cancelScheduledJob = (chatId, reminderId) => {
    if (scheduleJobs[chatId][reminderId] !== undefined && scheduleJobs[chatId][reminderId] != null) {
        scheduleJobs[chatId][reminderId].cancel();
        console.log("Cancel successfully");
    }
};

const setScheduleJob = (chatId, userId, reminderId, reminderContent, notiTime) => {
    if (scheduleJobs[chatId] === undefined) {
        scheduleJobs[chatId] = {};
    }
    cancelScheduledJob(chatId, reminderId);
    scheduleJobs[chatId][reminderId] = scheduleJob(notiTime, () => {
        sendReminder(chatId, reminderId, reminderContent)
    });
    console.log("LƯU THÀNH CÔNG SCHEDULE JOB " + reminderId + ` ${reminderContent}`);
    console.log(chatId, reminderId);
    console.log(notiTime);
    try {
        console.log(scheduleJobs[chatId][reminderId].pendingInvocations[0].fireDate);
    } catch (err) {
        console.log(scheduleJobs[chatId]);
    }
};

const resetScheduleJobs = () => {
    const reminders = getAllReminders(db);
    for (const reminder of reminders) {
        const { chatId, userId, id, content, notiTime } = reminder;
        const utcNow = new Date().toISOString(); // Current time in UTC
        if (notiTime <= utcNow) {
            console.log(BOT_MSG.REMINDER_DATE_IN_PAST_ERROR);
            continue;
        }
        setScheduleJob(chatId, userId, id, content, notiTime);
    }
};

const handleQuery = (data, chatId, userId) => {
    userAction[userId] = data;
    switch (data) {
        case "reminder_add": {
            const options = {
                parse_mode: "MarkdownV2",
            };
            bot.sendMessage(chatId, BOT_MSG.ADD_REMINDER_INSTRUCTION, options);
            break;
        }
        case "reminder_edit": {
            const options = {};
            bot.sendMessage(chatId, BOT_MSG.EDIT_REMINDER_ID_ASK, options);
            break;
        }
        case "reminder_remove": {
            const options = {};
            bot.sendMessage(chatId, BOT_MSG.REMOVE_REMINDER_INSTRUCTION, options);
            break;
        }
        case "timezone_update": {
            const options = {};
            let message = BOT_MSG.UPDATE_TIMEZONE_INSTRUCTION;
            if (userUtcOffset[userId] !== undefined) {
                const currentOffset = userUtcOffset[userId] / (60 * 60 * 1000); // convert ms to hours
                message += `\n\n${BOT_MSG.CURRENT_TIMEZONE} ${currentOffset}`;
            }
            bot.sendMessage(chatId, message, options);
            break;
        }
    }
};

const resetUserTimezoneOffset = () => {
    const users = getAllUserTimezoneOffset(db);
    for (const u of users) {
        const {userId, utcOffset} = u;
        userUtcOffset[userId] = utcOffset;
    }
};

const initGenAI = () => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
    const instruction = `Nhiệm vụ của bạn là xử lý các yêu cầu đặt lời nhắc. Hãy trả về kết quả dưới dạng DD/MM/YY HH:MM <Nội dung lời nhắc>. KHÔNG thêm những chi tiết không cần thiết khác.`;
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-8b",
        systemInstruction: instruction,
    });
    return model;
};

const token = process.env.BOT_API;
const bot = new TelegramBot(token, {polling: true});
const db = connectToDatabase("nerdo.db");
const ai = initGenAI();
const userAction = {};
const userUtcOffset = {};
let currentReminderId = null;
const scheduleJobs = {};

(async function main() {
    resetScheduleJobs();
    resetUserTimezoneOffset();

    bot.on("callback_query", async(query) => {
        const msg = query.message;
        const data = query.data;
        const userId = query.from.id;
        const chatId = msg.chat.id;
        handleQuery(data, chatId, userId);
    });

    bot.on("message", async(msg) => {
        let text = msg.text;
        const userId = msg.from.id;
        const chatId = msg.chat.id;

        if (!findUser(db, chatId, userId)) {
            createUser(db, chatId, userId);
        }

        if (text !== undefined && text.startsWith('/')) {
            return;
        }

        if (text !== undefined && text.startsWith('@')) { // if message begins with someone's tag
            text = removeBeginningMention(text);
        }

        if (userId in userAction) {
            const action = userAction[userId];
            delete userAction[userId];

            switch (action) {
                case "reminder_add": {
                    if (msg.voice) {
                        const t = performance.now();
                        const audioUrl = await bot.getFileLink(msg.voice.file_id);
                        let transcript = "";
                        console.log(audioUrl);

                        switch (process.env.STT_METHOD) {
                            case "huggingface":
                                transcript = await transcribeHf(audioUrl);
                                break;

                            case "gemini":
                                transcript = await transcribeGemini(ai, audioUrl);
                                break;

                            case "whisper.cpp":
                                transcript = await transcribe(audioUrl);
                                break;

                            default:
                                console.log("You have NOT set any Speech-To-Text method.");
                                break;
                        }
                        console.log("Thời gian transcribe xong:", performance.now() - t, "ms");
                        const result = await ai.generateContent(`Thời gian hiện tại là ${formatTime(new Date(), userUtcOffset[userId])}. Yêu cầu đặt lời nhắc là ${transcript}`);
                        text = result.response.text();
                        console.log("Lời nhắc trích được từ audio:", text);
                        console.log("Tổng thời gian:", performance.now() - t, "ms");
                        break;
                    }
                    const {content, notiTime} = parseReminder(text, userUtcOffset[userId]) || {};
                    if (content === undefined) {
                        bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_FORMAT, { parse_mode: "MarkdownV2" });
                        userAction[userId] = "reminder_add";
                        break;
                    }
                    const utcNow = new Date().toISOString(); // Current time in UTC
                    if (notiTime <= utcNow) {
                        bot.sendMessage(chatId, BOT_MSG.REMINDER_DATE_IN_PAST_ERROR);
                        userAction[userId] = "reminder_add";
                        break;
                    }
                    const dbResult = createReminder(db, chatId, userId, content, notiTime);
                    if (dbResult) {
                        setScheduleJob(chatId, userId, dbResult.lastInsertRowid, content, notiTime);
                        bot.sendMessage(chatId, BOT_MSG.REMINDER_SAVED_SUCCESS);
                    }

                    break;
                }
                case "reminder_edit": {
                    const reminderId = escapeMarkdown(text);
                    currentReminderId = reminderId;
                    const dbResult = getReminder(db, reminderId);
                    if (dbResult) {
                        const reminder = dbResult;
                        const {notiTime, content} = reminder;
                        if (notiTime === undefined) {
                            bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_ID);
                            userAction[userId] = "reminder_edit";
                            break;
                        }

                        const text = `Lời nhắc \\#${reminderId}:\n🔔 *${escapeMarkdown(content)}*\n🕒 _${formatTime(notiTime, userUtcOffset[userId])}_\n\n${BOT_MSG.EDIT_REMINDER_INSTRUCTION}`;
                        const options = {
                            parse_mode: "MarkdownV2",
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "Ấn vào đây để sửa lời nhắc" + ` #${reminderId}`,
                                            switch_inline_query_current_chat: toReminderString(content, notiTime, userUtcOffset[userId]),
                                        },
                                    ],
                                ],
                            },
                        };
                        bot.sendMessage(chatId, text, options);
                        userAction[userId] = "reminder_editing";
                    }
                    break;
                }
                case "reminder_editing": {
                    if (currentReminderId == null) {
                        console.log("currentReminderId is null");
                    }
                    const {notiTime, content} = parseReminder(text, userUtcOffset[userId]) || {};
                    if (content === undefined) {
                        bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_FORMAT, { parse_mode: "MarkdownV2" });
                        userAction[userId] = "reminder_editing";
                        break;
                    }
                    const utcNow = new Date().toISOString(); // Current time in UTC
                    if (notiTime <= utcNow) {
                        bot.sendMessage(chatId, BOT_MSG.REMINDER_DATE_IN_PAST_ERROR);
                        userAction[userId] = "reminder_editing";
                        break;
                    }
                    const reminderId = currentReminderId;
                    const dbResult = updateReminder(db, reminderId, notiTime, content);
                    if (dbResult) {
                        setScheduleJob(chatId, userId, reminderId, content, notiTime);
                        bot.sendMessage(chatId, BOT_MSG.REMINDER_SAVED_SUCCESS);
                    }
                    currentReminderId = null;

                    break;
                }
                case "reminder_remove": {
                    const reminderId = escapeMarkdown(text);
                    const dbResult = deleteReminder(db, reminderId);
                    console.log(dbResult);
                    if (dbResult && dbResult.changes > 0) {
                        cancelScheduledJob(chatId, reminderId);
                        bot.sendMessage(chatId, BOT_MSG.REMINDER_DELETED_SUCCESS);
                    } else {
                        bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_ID);
                        userAction[userId] = "reminder_remove";
                    }
                    break;
                }
                case "timezone_update": {
                    const utcOffset = parseInt(escapeMarkdown(text));
                    if (isNaN(utcOffset)) {
                        bot.sendMessage(chatId, BOT_MSG.INVALID_TIMEZONE_FORMAT);
                        userAction[userId] = "timezone_update";
                        break;
                    }
                    const utcOffsetInMs = hourToMs(utcOffset);
                    const dbResult = updateUserTimezoneOffset(db, chatId, userId, utcOffsetInMs);
                    if (dbResult) {
                        bot.sendMessage(chatId, BOT_MSG.UPDATE_TIMEZONE_SUCCESS);
                        userUtcOffset[userId] = utcOffsetInMs;
                    }
                    break;
                }
            }
        }
    });

    bot.onText(/\/start/, async(msg) => {
        const userId = msg.from.id;
        const chatId = msg.chat.id;


        let inline_keyboard = [
            [
                {
                    text: "Add a reminder",
                    callback_data: "reminder_add",
                },
            ],
            [
                {
                    text: "Edit a reminder",
                    callback_data: "reminder_edit",
                },
            ],
            [
                {
                    text: "Remove a reminder",
                    callback_data: "reminder_remove",
                },
            ],
            [
                {
                    text: "Update timezone",
                    callback_data: "timezone_update",
                },
            ],
        ];
        if (userUtcOffset[userId] === undefined) {
            inline_keyboard = [
                [
                    {
                        text: "Update timezone",
                        callback_data: "timezone_update",
                    },
                ],
            ];
        }
        const options = {
            reply_markup: {
                inline_keyboard
            },
            parse_mode: "HTML"
        };
        let message = "📅 <b>Lời nhắc:</b>\n\n";
        if (userUtcOffset[userId] === undefined) {
            message = BOT_MSG.UPDATE_TIMEZONE_FIRST;
        } else {
            const remindersList = getReminders(db, chatId, userId);
            for (const reminder of remindersList) {
                const notiTime = formatTime(reminder.notiTime, userUtcOffset[userId]);
                message += `🔔 [#${reminder.id}] <b>${reminder.content}</b>\n🕒 <i>${notiTime}</i>\n\n`;
            }
        }
        bot.sendMessage(chatId, message, options);
    });

    bot.onText(/\/add/, async(msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        if (userUtcOffset[userId] === undefined) {
            bot.sendMessage(chatId, BOT_MSG.UPDATE_TIMEZONE_FIRST);
            return;
        }
        handleQuery("reminder_add", chatId, userId);
    });

    bot.onText(/\/edit/, async(msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        if (userUtcOffset[userId] === undefined) {
            bot.sendMessage(chatId, BOT_MSG.UPDATE_TIMEZONE_FIRST);
            return;
        }
        handleQuery("reminder_edit", chatId, userId);
    });

    bot.onText(/\/del/, async(msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        if (userUtcOffset[userId] === undefined) {
            bot.sendMessage(chatId, BOT_MSG.UPDATE_TIMEZONE_FIRST);
            return;
        }
        handleQuery("reminder_remove", chatId, userId);
    });

    process.on('exit', () => db.close());
})();
