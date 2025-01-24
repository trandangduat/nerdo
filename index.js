import TelegramBot from "node-telegram-bot-api";
import { scheduleJob } from "node-schedule";
import { createReminder, createUser, deleteReminder, deleteReminders, findUser, getAllReminders, getAllUserTimezoneOffset, getReminder, getReminders, updateReminder, updateReminderNotifiedStatus, updateUserTimezoneOffset } from "./db_op.js";
import { parseReminder, formatTime, toReminderString, removeBeginningMention, escapeMarkdown, hourToMs, minuteToMs, styleReminder } from "./utils.js";
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

const handleQuery = (data, chatId, userId, queryId = null) => {
    userAction[userId] = data;
    switch (data) {
        case "reminder_start": {
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
            break;
        }
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
    if (queryId) {
        bot.answerCallbackQuery(queryId);
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
    const instruction = `
        Bạn là một trợ lý chuyên xử lý các yêu cầu đặt lời nhắc.

        Nhiệm vụ của bạn là chuyển đổi yêu cầu của người dùng thành định dạng: DD/MM/YY HH:MM <Nội dung lời nhắc>.

        Ví dụ:
        - "Nhắc tôi đi mua đồ lúc 6 giờ chiều ngày mai" -> "16/06/24 18:00 Đi mua đồ" (Giả sử hôm nay là 15/06/2024)
        - "Lịch họp team lúc 10 giờ sáng 2 ngày nữa" -> "17/06/24 10:00 Lịch họp team" (Giả sử hôm nay là 15/06/2024)
        - "Nhắc đi ngủ lúc 11h tối" -> "15/06/24 23:00 Nhắc đi ngủ" (Giả sử hôm nay là 15/06/2024)
        - "Tập thể dục vào lúc 7h30 sáng thứ 6 tuần sau" -> "21/06/24 07:30 Tập thể dục" (Giả sử hôm nay là 15/06/2024)
        - "Ngày 20 tháng 12 năm 2024 lúc 3 giờ chiều có cuộc hẹn nha khoa" -> "20/12/24 15:00 Có cuộc hẹn nha khoa"

        Nếu người dùng không nói rõ năm, hãy sử dụng năm hiện tại.
        Nếu người dùng không nói rõ ngày, hãy sử dụng ngày hiện tại nếu thời gian đặt lời nhắc là hôm nay hoặc ngày mai nếu thời gian đặt lời nhắc là trong tương lai (không thuộc hôm nay).

        Bạn cần trích xuất chính xác ngày tháng năm, giờ và phút từ yêu cầu.
        Nội dung lời nhắc là phần còn lại của yêu cầu.

        KHÔNG thêm bất kỳ thông tin nào khác vào câu trả lời ngoài định dạng này.

        Trả lời đúng theo định dạng yêu cầu, không có bất kỳ thông tin thừa nào khác.
    `;
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-8b",
        systemInstruction: instruction,
    });
    return model;
};

const handleAddReminder = async(msg) => {
    let text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (msg.voice) {
        const processingMessage = await bot.sendMessage(chatId, "Đang trích dẫn yêu cầu từ voice chat... (￣﹃￣)");
        const processingMsgId = processingMessage.message_id;
        const t = performance.now();
        const audioUrl = await bot.getFileLink(msg.voice.file_id);
        console.log(audioUrl);

        let transcript = "";
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

        await bot.editMessageText("Đang xử lý yêu cầu đặt lời nhắc... ヾ(￣▽￣) Bye~Bye~", {
            chat_id: chatId,
            message_id: processingMsgId
        });

        const currentTime = formatTime(new Date(), userUtcOffset[userId])
        const result = await ai.generateContent(`Thời gian hiện tại: ${currentTime}. Yêu cầu: ${transcript}`);
        text = result.response.text();
        console.log("Lời nhắc trích được từ audio:", text);
        console.log("Tổng thời gian:", performance.now() - t, "ms");

        await bot.deleteMessage(chatId, processingMsgId);
    }
    const {content, notiTime} = parseReminder(text, userUtcOffset[userId]) || {};
    if (content === undefined) {
        bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_FORMAT, { parse_mode: "MarkdownV2" });
        userAction[userId] = "reminder_add";
        return;
    }
    const utcNow = new Date().toISOString();
    if (notiTime <= utcNow) {
        bot.sendMessage(chatId, BOT_MSG.REMINDER_DATE_IN_PAST_ERROR);
        userAction[userId] = "reminder_add";
        return;
    }
    const dbResult = createReminder(db, chatId, userId, content, notiTime);
    const reminderId = dbResult.lastInsertRowid;
    if (dbResult) {
        setScheduleJob(chatId, userId, reminderId, content, notiTime);
        const options = {
            parse_mode: "MarkdownV2",
            reply_markup: {
                inline_keyboard: [ [ { text: "Xem danh sách lời nhắc", callback_data: "reminder_start" } ] ]
            }
        };
        bot.sendMessage(chatId, BOT_MSG.REMINDER_SAVED_SUCCESS + styleReminder(reminderId, content, notiTime, userUtcOffset[userId]), options);
    }
};

const handleEditReminder = async (msg) => {
    const text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const reminderId = escapeMarkdown(text);
    currentReminderId = reminderId;
    const dbResult = getReminder(db, reminderId);
    if (dbResult) {
        const reminder = dbResult;
        const { notiTime, content } = reminder;
        if (notiTime === undefined) {
            bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_ID);
            userAction[userId] = "reminder_edit";
            return;
        }

        const text = `${styleReminder(reminderId, content, notiTime, userUtcOffset[userId])}${BOT_MSG.EDIT_REMINDER_INSTRUCTION}`;
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
};

const handleEditingReminder = async (msg) => {
    const text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    if (currentReminderId == null) {
        console.log("currentReminderId is null");
        return;
    }
    const { notiTime, content } = parseReminder(text, userUtcOffset[userId]) || {};
    if (content === undefined) {
        bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_FORMAT, { parse_mode: "MarkdownV2" });
        userAction[userId] = "reminder_editing";
        return;
    }
    const utcNow = new Date().toISOString();
    if (notiTime <= utcNow) {
        bot.sendMessage(chatId, BOT_MSG.REMINDER_DATE_IN_PAST_ERROR);
        userAction[userId] = "reminder_editing";
        return;
    }
    const reminderId = currentReminderId;
    const dbResult = updateReminder(db, reminderId, notiTime, content);
    if (dbResult) {
        setScheduleJob(chatId, userId, reminderId, content, notiTime);
        const options = {
            parse_mode: "MarkdownV2",
            reply_markup: {
                inline_keyboard: [ [ { text: "Xem danh sách lời nhắc", callback_data: "reminder_start" } ] ]
            }
        };
        bot.sendMessage(chatId, BOT_MSG.REMINDER_EDITED_SUCCESS + styleReminder(reminderId, content, notiTime, userUtcOffset[userId]), options);
    }
    currentReminderId = null;
};

const handleRemoveReminder = async (msg) => {
    const text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const escapedText = escapeMarkdown(text);
    const reminderIds = escapedText.split(" ");
    const dbResult = deleteReminders(db, reminderIds);
    console.log(dbResult);
    if (dbResult && dbResult.changes > 0) {
        for (const r_id of reminderIds) {
            cancelScheduledJob(chatId, r_id);
        }
        const options = {
            reply_markup: {
                inline_keyboard: [ [ { text: "Xem danh sách lời nhắc", callback_data: "reminder_start" } ] ]
            }
        };
        bot.sendMessage(chatId, BOT_MSG.REMINDER_DELETED_SUCCESS, options);
    } else {
        bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_ID);
        userAction[userId] = "reminder_remove";
    }
};

const handleTimezoneUpdate = async (msg) => {
    const text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const utcOffset = parseInt(escapeMarkdown(text));
    if (isNaN(utcOffset)) {
        bot.sendMessage(chatId, BOT_MSG.INVALID_TIMEZONE_FORMAT);
        userAction[userId] = "timezone_update";
        return;
    }
    const utcOffsetInMs = hourToMs(utcOffset);
    const dbResult = updateUserTimezoneOffset(db, chatId, userId, utcOffsetInMs);
    if (dbResult) {
        bot.sendMessage(chatId, BOT_MSG.UPDATE_TIMEZONE_SUCCESS);
        userUtcOffset[userId] = utcOffsetInMs;
    }
};

const token = process.env.BOT_API;
const bot = new TelegramBot(token, {polling: true});
const db = connectToDatabase("nerdo.db");
const ai = initGenAI();
const userAction = {};
const userUtcOffset = {};
let currentReminderId = null;
const scheduleJobs = {};
const spinner = ["㊂", "㊀", "㊁"];

(async function main() {
    resetScheduleJobs();
    resetUserTimezoneOffset();

    bot.on("callback_query", async(query) => {
        const msg = query.message;
        const data = query.data;
        const userId = query.from.id;
        const chatId = msg.chat.id;
        handleQuery(data, chatId, userId, query.id);
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
                    handleAddReminder(msg);
                    break;
                }
                case "reminder_edit": {
                    handleEditReminder(msg);
                    break;
                }
                case "reminder_editing": {
                    handleEditingReminder(msg);
                    break;
                }
                case "reminder_remove": {
                    handleRemoveReminder(msg);
                    break;
                }
                case "timezone_update": {
                    handleTimezoneUpdate(msg);
                    break;
                }
            }
        }
    });

    bot.onText(/\/start/, async(msg) => {
        const userId = msg.from.id;
        const chatId = msg.chat.id;
        handleQuery("reminder_start", chatId, userId);
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
