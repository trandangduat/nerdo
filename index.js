import TelegramBot from "node-telegram-bot-api";
import mysql from 'mysql2/promise'
import { createUser, findUser } from "./db_op.js";

const token = process.env.BOT_API;
const bot = new TelegramBot(token, {polling: true});
const dbConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
});

bot.on("message", async(msg) => {
    console.log("hey!");
    const text = msg.text;
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (!await findUser(dbConnection, chatId, userId)) {
        await createUser(dbConnection, chatId, userId);
    }

    let inline_keyboard = [
                    [{
                        text: "Edit reminder",
                        callback_data: "lmao"
                    }],
                    [{
                        text: "Remove reminder",
                        callback_data: "lmao"
                    }],
                ];


    if (text == "/start") {
        try {
            const [results] = await dbConnection.query(
                `SELECT * FROM users LIMIT 5`,
            );
            bot.sendMessage(chatId, `hehe`, {
                reply_markup: {
                    inline_keyboard: inline_keyboard
                }
            });
        } catch (err) {
            console.log(err);
        }
    }

});
