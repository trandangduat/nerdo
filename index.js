import TelegramBot from "node-telegram-bot-api";
import mysql from 'mysql2/promise'
import { scheduleJob } from "node-schedule";
import { createReminder, createUser, deleteReminder, findUser, getReminder, getReminders, updateReminder, updateReminderNotifiedStatus } from "./db_op.js";
import { parseReminder, formatTime, toReminderString, removeBeginningMention } from "./utils.js";
import * as BOT_MSG from "./bot_msg.js";

const token = process.env.BOT_API;
const bot = new TelegramBot(token, {polling: true});
const dbConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
});
const userAction = {};
let currentReminderId = null;

const sendReminder = async (chatId, reminderId, content) => {
    bot.sendMessage(chatId, content);
    await updateReminderNotifiedStatus(dbConnection, reminderId, true);
};

bot.on("callback_query", async(query) => {
    const msg = query.message;
    const data = query.data;
    const userId = query.from.id;
    const chatId = msg.chat.id;

    userAction[userId] = data;

    switch (data) {
        case "reminder_add": {
            const options = {
                parse_mode: "MarkdownV2",
            };
            bot.deleteMessage(chatId, msg.message_id);
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
});

bot.on("message", async(msg) => {
    let text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (!await findUser(dbConnection, chatId, userId)) {
        await createUser(dbConnection, chatId, userId);
    }

    if (text[0] == '@') { // if message begins with someone's tag
        text = removeBeginningMention(text);
    }

    if (userId in userAction) {
        const action = userAction[userId];
        delete userAction[userId];

        switch (action) {
            case "reminder_add": {
                const reminder = parseReminder(text);
                const dbResult = await createReminder(dbConnection, chatId, userId, reminder.content, reminder.notiTime);
                if (dbResult) {
                    scheduleJob(reminder.notiTime, async () => await sendReminder(chatId, dbResult.insertId, reminder.content));
                    bot.sendMessage(chatId, BOT_MSG.REMINDER_SAVED_SUCCESS);
                }

                break;
            }
            case "reminder_edit": {
                const reminderId = text;
                currentReminderId = reminderId;
                const dbResult = await getReminder(dbConnection, reminderId);
                if (dbResult) {
                    const reminder = dbResult[0];
                    const notiTime = formatTime(reminder.notiTime);
                    const content = `Lời nhắc \\#${reminderId}:\n🔔 *${reminder.content}*\n🕒 _${notiTime}_\n\n${BOT_MSG.EDIT_REMINDER_INSTRUCTION}`;
                    const options = {
                        parse_mode: "MarkdownV2",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Ấn vào đây để sửa lời nhắc" + ` #${reminderId}`,
                                        switch_inline_query_current_chat: toReminderString(reminder.content, reminder.notiTime),
                                    },
                                ],
                            ],
                        },
                    };
                    bot.sendMessage(chatId, content, options);
                    userAction[userId] = "reminder_editing";
                }
                break;
            }
            case "reminder_editing": {
                if (currentReminderId == null) {
                    console.log("currentReminderId is null");
                }
                const reminder = parseReminder(text);
                const reminderId = currentReminderId;
                const dbResult = await updateReminder(dbConnection, reminderId, reminder.notiTime, reminder.content);
                if (dbResult) {
                    scheduleJob(reminder.notiTime, async () => await sendReminder(chatId, dbResult.insertId, reminder.content));
                    bot.sendMessage(chatId, BOT_MSG.REMINDER_SAVED_SUCCESS);
                }
                currentReminderId = null;

                break;
            }
            case "reminder_remove": {
                const reminderId = text;
                const dbResult = await deleteReminder(dbConnection, reminderId);
                if (dbResult) {
                    bot.sendMessage(chatId, BOT_MSG.REMINDER_DELETED_SUCCESS);
                }
                break;
            }
        }

    } else {
        if (text == "/start") {
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
        }
    }
});
