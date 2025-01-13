export const createUser = async(con, chatId, userId) => {
    try {
        const sql = `INSERT INTO Users (chatId, userId)
                     VALUE (?, ?)`;
        const values = [chatId, userId];
        const [results] = await con.execute(sql, values);
        console.log(results);

    } catch (error) {
        console.log(error);
    }
};

export const findUser = async(con, chatId, userId) => {
    try {
        const sql = `SELECT COUNT(*) count FROM Users
                     WHERE chatId = ? AND userId = ?`;
        const values = [chatId, userId];
        const [rows] = await con.execute(sql, values);
        return (rows[0]["count"] > 0);

    } catch (error) {
        console.log(error);
        return false;
    }
};
export const updateUserTimezoneOffset = async(con, chatId, userId, utcOffset) => {
    try {
        const sql = `UPDATE Users SET utcOffset = ? WHERE chatId = ? AND userId = ?`;
        const values = [utcOffset, chatId, userId];
        const [results] = await con.execute(sql, values);
        return results;

    } catch (error) {
        console.log(error);
        return null;
    }
};

export const createReminder = async(con, chatId, userId, content, notiTime) => {
    try {
        const sql = `INSERT INTO Reminders (chatId, userId, content, notiTime)
                     VALUES (?, ?, ?, ?)`;
        const values = [chatId, userId, content, new Date(notiTime)];
        const [results] = await con.execute(sql, values);
        return results;

    } catch (error) {
        console.log(error);
        return null;
    }
}

export const getReminder = async(con, reminderId) => {
    try {
        const sql = `SELECT content, notiTime, id FROM Reminders
                     WHERE id = ? AND isNotified = false`;
        const values = [reminderId];
        const [rows] = await con.execute(sql, values);
        return rows;

    } catch (error) {
        console.log(error);
        return null;
    }
}

export const getReminders = async(con, chatId, userId, limit = 5) => {
    try {
        limit = limit + '';
        const sql = `SELECT content, notiTime, id FROM Reminders
                     WHERE chatId = ? AND userId = ? AND isNotified = false
                     ORDER BY notiTime
                     LIMIT ?`;
        const values = [chatId, userId, limit];
        const [rows] = await con.execute(sql, values);
        return rows;

    } catch (error) {
        console.log(error);
        return null;
    }
}
export const getAllReminders = async(con) => {
    try {
        const sql = `SELECT content, notiTime, id, chatId FROM Reminders
                     WHERE isNotified = false
                     ORDER BY notiTime`;
        const [rows] = await con.execute(sql);
        return rows;

    } catch (error) {
        console.log(error);
        return null;
    }
}
export const updateReminder = async(con, reminderId, notiTime, reminder) => {
    try {
        const sql = "UPDATE Reminders SET notiTime = ?, content = ? WHERE id = ?";
        const values = [new Date(notiTime), reminder, reminderId];
        const [results] = await con.execute(sql, values);
        return results;
    } catch (error){
        console.log(error);
        return null;
    }
}

export const updateReminderNotifiedStatus = async(con, reminderId, status) => {
    try {
        const sql = "UPDATE Reminders SET isNotified = ? WHERE id = ?";
        const values = [status, reminderId];
        const [results] = await con.execute(sql, values);
    } catch (error) {
        console.log(error);
    }
}

export const deleteReminder = async(con, reminderId) => {
    try {
        const sql = "DELETE FROM Reminders WHERE id = ?";
        const values = [reminderId];
        const [results] = await con.execute(sql, values);
        return results;
    } catch (error) {
        console.log(error);
        return null;
    }
}
