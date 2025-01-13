import TelegramBot from "node-telegram-bot-api";
import mysql from 'mysql2/promise'
import { scheduledJobs, scheduleJob } from "node-schedule";
import { createReminder, createUser, deleteReminder, findUser, getAllReminders, getReminder, getReminders, updateReminder, updateReminderNotifiedStatus } from "./db_op.js";
import { parseReminder, formatTime, toReminderString, removeBeginningMention, escapeMarkdown } from "./utils.js";
import * as BOT_MSG from "./bot_msg.js";

const token = process.env.BOT_API;
const bot = new TelegramBot(token, {polling: true});

const connectToDatabase = async(attempts = 5) => {
    let con;
    while (attempts--) {
        console.log("CONNECTING TO DATABASE ATTEMPT #" + (5 - attempts));
        try {
            con = await mysql.createConnection({
                host: process.env.DB_HOST,
                port: process.env.DB_PORT,
                user: process.env.DB_USER,
                password: process.env.DB_PASS,
                database: process.env.DB_DATABASE,
            });
            console.log("KET NOI DATABASE THANH CONG!");
            return con;
        } catch(err) {
            console.log(err);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return null;
};

const dbConnection = await connectToDatabase();
const userAction = {};
let currentReminderId = null;
const scheduleJobs = {};

const sendReminder = async (chatId, reminderId, content) => {
    bot.sendMessage(chatId, content);
    await updateReminderNotifiedStatus(dbConnection, reminderId, true);
};

const cancelScheduledJob = (chatId, reminderId) => {
    if (scheduleJobs[chatId][reminderId] !== undefined && scheduleJobs[chatId][reminderId] != null) {
        scheduleJobs[chatId][reminderId].cancel();
        console.log("Cancel successfully");
    }
};

const setScheduleJob = async(chatId, userId, reminderId, reminderContent, notiTime) => {
    if (scheduleJobs[chatId] === undefined) {
        scheduleJobs[chatId] = {};
    }
    cancelScheduledJob(chatId, reminderId);
    scheduleJobs[chatId][reminderId] = scheduleJob(notiTime, async() => {
        await sendReminder(chatId, reminderId, reminderContent)
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

const resetScheduleJobs = async () => {
    const reminders = await getAllReminders(dbConnection);
    for (const reminder of reminders) {
        const { chatId, userId, id, content, notiTime } = reminder;
        const utcNow = new Date().toISOString(); // Current time in UTC
        if (notiTime <= utcNow) {
            console.log(BOT_MSG.REMINDER_DATE_IN_PAST_ERROR);
            continue;
        }
        await setScheduleJob(chatId, userId, id, content, notiTime);
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
    }
};

resetScheduleJobs();

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

    if (!await findUser(dbConnection, chatId, userId)) {
        await createUser(dbConnection, chatId, userId);
    }

    if (text.startsWith('/')) {
        return;
    }

    if (text.startsWith('@')) { // if message begins with someone's tag
        text = removeBeginningMention(text);
    }

    if (userId in userAction) {
        const action = userAction[userId];
        delete userAction[userId];

        switch (action) {
            case "reminder_add": {
                const {content, notiTime} = parseReminder(text) || {};
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
                const dbResult = await createReminder(dbConnection, chatId, userId, content, notiTime);
                if (dbResult) {
                    await setScheduleJob(chatId, userId, dbResult.insertId, content, notiTime);
                    bot.sendMessage(chatId, BOT_MSG.REMINDER_SAVED_SUCCESS);
                }

                break;
            }
            case "reminder_edit": {
                const reminderId = escapeMarkdown(text);
                currentReminderId = reminderId;
                const dbResult = await getReminder(dbConnection, reminderId);
                if (dbResult) {
                    const reminder = dbResult[0] || {};
                    const {notiTime, content} = reminder;
                    if (notiTime === undefined) {
                        bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_ID);
                        userAction[userId] = "reminder_edit";
                        break;
                    }

                    const text = `Lời nhắc \\#${reminderId}:\n🔔 *${escapeMarkdown(content)}*\n🕒 _${formatTime(notiTime)}_\n\n${BOT_MSG.EDIT_REMINDER_INSTRUCTION}`;
                    const options = {
                        parse_mode: "MarkdownV2",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Ấn vào đây để sửa lời nhắc" + ` #${reminderId}`,
                                        switch_inline_query_current_chat: toReminderString(content, notiTime),
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
                const {notiTime, content} = parseReminder(text) || {};
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
                const dbResult = await updateReminder(dbConnection, reminderId, notiTime, content);
                if (dbResult) {
                    await setScheduleJob(chatId, userId, reminderId, content, notiTime);
                    bot.sendMessage(chatId, BOT_MSG.REMINDER_SAVED_SUCCESS);
                }
                currentReminderId = null;

                break;
            }
            case "reminder_remove": {
                const reminderId = escapeMarkdown(text);
                const dbResult = await deleteReminder(dbConnection, reminderId);
                if (dbResult && dbResult.affectedRows > 0) {
                    cancelScheduledJob(chatId, reminderId);
                    bot.sendMessage(chatId, BOT_MSG.REMINDER_DELETED_SUCCESS);
                } else {
                    bot.sendMessage(chatId, BOT_MSG.WRONG_REMINDER_ID);
                    userAction[userId] = "reminder_remove";
                }
                break;
            }
        }

    }
});

bot.onText(/\/start/, async(msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    delete userAction[userId];

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
    ];
    const options = {
        reply_markup: {
            inline_keyboard
        },
        parse_mode: "HTML"
    };
    const remindersList = await getReminders(dbConnection, chatId, userId);
    let message = "📅 <b>Lời nhắc:</b>\n\n";
    for (const reminder of remindersList) {
        const notiTime = formatTime(reminder.notiTime);
        message += `🔔 [#${reminder.id}] <b>${reminder.content}</b>\n🕒 <i>${notiTime}</i>\n\n`;
    }
    bot.sendMessage(chatId, message, options);
});

bot.onText(/\/add/, async(msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    handleQuery("reminder_add", chatId, userId);
});

bot.onText(/\/edit/, async(msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    handleQuery("reminder_edit", chatId, userId);
});

bot.onText(/\/del/, async(msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    handleQuery("reminder_remove", chatId, userId);
});
