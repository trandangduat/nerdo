import Database from 'better-sqlite3';

const db = new Database('database.db');

export const createUser = (db, chatId, userId) => {
    try {
        const sql = `INSERT INTO Users (chatId, userId) VALUES (?, ?)`;
        const stmt = db.prepare(sql);
        const result = stmt.run(chatId, userId);
        console.log(result);
    } catch (error) {
        console.log(error);
    }
};

export const findUser = (db, chatId, userId) => {
    try {
        const sql = `SELECT COUNT(*) count FROM Users WHERE chatId = ? AND userId = ?`;
        const stmt = db.prepare(sql);
        const row = stmt.get(chatId, userId);
        return (row["count"] > 0);
    } catch (error) {
        console.log(error);
        return false;
    }
};

export const updateUserTimezoneOffset = (db, chatId, userId, utcOffset) => {
    try {
        const sql = `UPDATE Users SET utcOffset = ? WHERE chatId = ? AND userId = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.run(utcOffset, chatId, userId);
        return result;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const getAllUserTimezoneOffset = (db) => {
    try {
        const sql = `SELECT userId, utcOffset FROM Users WHERE utcOffset IS NOT NULL`;
        const stmt = db.prepare(sql);
        const rows = stmt.all();
        return rows;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const createReminder = (db, chatId, userId, content, notiTime) => {
    try {
        const sql = `INSERT INTO Reminders (chatId, userId, content, notiTime) VALUES (?, ?, ?, ?)`;
        const stmt = db.prepare(sql);
        const result = stmt.run(chatId, userId, content, notiTime);
        return result;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const getReminder = (db, reminderId) => {
    try {
        const sql = `SELECT content, notiTime, id FROM Reminders WHERE id = ? AND isNotified = 0`;
        const stmt = db.prepare(sql);
        const row = stmt.get(reminderId);
        return row;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const getReminders = (db, chatId, userId, limit = 5) => {
    try {
        const sql = `SELECT content, notiTime, id FROM Reminders WHERE chatId = ? AND userId = ? AND isNotified = 0 ORDER BY notiTime LIMIT ?`;
        const stmt = db.prepare(sql);
        const rows = stmt.all(chatId, userId, limit);
        return rows;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const getAllReminders = (db) => {
    try {
        const sql = `SELECT content, notiTime, id, chatId FROM Reminders WHERE isNotified = 0 ORDER BY notiTime`;
        const stmt = db.prepare(sql);
        const rows = stmt.all();
        console.log(rows);
        return rows;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const updateReminder = (db, reminderId, notiTime, reminder) => {
    try {
        const sql = "UPDATE Reminders SET notiTime = ?, content = ? WHERE id = ?";
        const stmt = db.prepare(sql);
        const result = stmt.run(notiTime, reminder, reminderId);
        return result;
    } catch (error){
        console.log(error);
        return null;
    }
};

export const updateReminderNotifiedStatus = (db, reminderId, status) => {
    try {
        const sql = "UPDATE Reminders SET isNotified = ? WHERE id = ?";
        const stmt = db.prepare(sql);
        const result = stmt.run(status, reminderId);
        return result;
    } catch (error) {
        console.log(error);
    }
};

export const deleteReminder = (db, reminderId) => {
    try {
        const sql = "DELETE FROM Reminders WHERE id = ?";
        const stmt = db.prepare(sql);
        const result = stmt.run(reminderId);
        return result;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const deleteReminders = (db, reminderIds) => {
    try {
        let result;
        const sql = "DELETE FROM Reminders WHERE id IN (SELECT value FROM json_each(?))";
        const stmt = db.prepare(sql);
        result = stmt.run(JSON.stringify(reminderIds));
        return result;
    } catch (error) {
        console.log(error);
        return null;
    }
};
