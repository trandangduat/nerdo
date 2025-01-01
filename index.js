import TelegramBot from "node-telegram-bot-api";
import mysql from 'mysql2/promise'
import { scheduleJob } from "node-schedule";
import { createReminder, createUser, deleteReminder, findUser, getReminders, updateReminderNotifiedStatus } from "./db_op.js";
import { parseReminder, formatTime } from "./utils.js";

const token = process.env.BOT_API;
const bot = new TelegramBot(token, {polling: true});
const dbConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
});
const userAction = {};

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
            const message = "Vui lòng gửi lời nhắc theo định dạng:\n\n`<DD-MM-YY> <hh:mm> <Nội dung lời nhắc>`\n\nVí dụ: `25-12-23 18:30 Mua quà Giáng Sinh`";
            bot.sendMessage(chatId, message, options);
            break;
        }
        case "reminder_edit": {
            break;
        }
        case "reminder_remove": {
            const options = {};
            const message = "Vui lòng gửi id của lời nhắc bạn muốn xoá.";
            bot.sendMessage(chatId, message, options);
            break;
        }
    }
});

bot.on("message", async(msg) => {
    const text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (!await findUser(dbConnection, chatId, userId)) {
        await createUser(dbConnection, chatId, userId);
    }

    if (userId in userAction) {
        switch (userAction[userId]) {
            case "reminder_add": {
                const reminder = parseReminder(text);
                const dbResult = await createReminder(dbConnection, chatId, userId, reminder.content, reminder.notiTime);
                if (dbResult) {
                    scheduleJob(reminder.notiTime, async () => await sendReminder(chatId, dbResult.insertId, reminder.content));
                    bot.sendMessage(chatId, "Đã lưu thành công lời nhắc!");
                }

                break;
            }
            case "reminder_edit": {
                break;
            }
            case "reminder_remove": {
                const dbResult = await deleteReminder(dbConnection, text);
                if (dbResult) {
                    bot.sendMessage(chatId, "Đã xoá thành công lời nhắc!");
                }
                break;
            }
        }
        delete userAction[userId];

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
                message += `🔔 <b>${reminder.content}</b>[#${reminder.id}]\n🕒 <i>${notiTime}</i>\n\n`;
            }
            bot.sendMessage(chatId, message, options);
        }
    }
});
