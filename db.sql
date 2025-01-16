-- CREATE DATABASE IF NOT EXISTS nerdo;
-- USE nerdo;

CREATE TABLE IF NOT EXISTS Users (
    chatId INTEGER, -- ID of the chat where the user is interacting
    userId INTEGER, -- ID of the user
    utcOffset INTEGER, -- User's timezone offset in milliseconds
    PRIMARY KEY (chatId, userId)
);

CREATE TABLE IF NOT EXISTS Reminders (
    id INTEGER PRIMARY KEY, -- Unique identifier for each reminder
    chatId INTEGER NOT NULL, -- ID of the chat where the reminder is created
    userId INTEGER NOT NULL, -- ID of the user who created the reminder
    content TEXT NOT NULL, -- Content of the reminder
    timeAdded TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp when the reminder is added
    notiTime TIMESTAMP NOT NULL, -- Notification time for the reminder
    isNotified BOOLEAN DEFAULT FALSE -- Whether the reminder has been notified (optional)
);
