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

export const createReminder = async(con, chatId, userId, content, notiTime) => {
    try {
        const sql = `INSERT INTO Reminders (chatId, userId, content, notiTime)
                     VALUES (?, ?, ?, ?)`;
        const values = [chatId, userId, content, notiTime];
        const [results] = await con.execute(sql, values);
        console.log(results);

    } catch (error) {
        console.log(error);
    }
}

export const getReminders = async(con, chatId, userId, limit = 5) => {
    try {
        limit = limit + '';
        const sql = `SELECT content, notiTime FROM Reminders
                     WHERE chatId = ? AND userId = ? AND isNotified = false
                     ORDER BY notiTime DESC
                     LIMIT ?`;
        const values = [chatId, userId, limit];
        const [rows] = await con.execute(sql, values);
        return rows;

    } catch (error) {
        console.log(error);
    }
}
