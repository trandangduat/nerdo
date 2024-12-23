import TelegramBot from "node-telegram-bot-api";
import mysql from 'mysql2/promise'
import { createReminder, createUser, findUser } from "./db_op.js";
import { parseReminder } from "./utils.js";

const token = process.env.BOT_API;
const bot = new TelegramBot(token, {polling: true});
const dbConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
});
const userAction = {};

bot.on("callback_query", async(query) => {
    const msg = query.message;
    const data = query.data;
    const userId = query.from.id;
    const chatId = msg.chat.id;

    console.log(query);

    userAction[userId] = data;

    switch (data) {
        case "reminder_add": {
            const options = {
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "Điền nội dung lời nhắc...",
                    selective: true
                }
            };
            const message = `Trả lời tin nhắn này bằng lời nhắc của bạn.\n Lời nhắc phải có dạng: <DD-MM-YY> <hh:mm> <Nội dung lời nhắc>`;
            bot.sendMessage(chatId, message, options);
            break;
        }
        case "reminder_edit": {
            break;
        }
        case "reminder_remove": {
            break;
        }
    }

    bot.answerCallbackQuery(query.id, { text: 'Processed!' });

});

bot.on("message", async(msg) => {
    const text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    // console.log(msg);

    if (!await findUser(dbConnection, chatId, userId)) {
        await createUser(dbConnection, chatId, userId);
    }

    console.log(userAction);

    if (userId in userAction) {
        console.log("yassssssss");
        switch (userAction[userId]) {
            case "reminder_add": {
                const reminder = parseReminder(text);
                bot.sendMessage(chatId, JSON.stringify(reminder));
                createReminder(dbConnection, chatId, userId, reminder.content, reminder.notiTime);
                break;
            }
            case "reminder_edit": {
                break;
            }
            case "reminder_remove": {
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
                }
            };
            bot.sendMessage(chatId, `hehe`, options);
        }
    }

});
