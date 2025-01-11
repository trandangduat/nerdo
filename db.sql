CREATE DATABASE IF NOT EXISTS nerdo;
USE nerdo;

CREATE TABLE Users (
    chatId BIGINT,
    userId BIGINT,
    PRIMARY KEY (chatId, userId)
);

CREATE TABLE Reminders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, -- Unique identifier for each reminder
    chatId BIGINT NOT NULL,               -- ID of the chat where the reminder is created
    userId BIGINT NOT NULL,               -- ID of the user who created the reminder
    content TEXT NOT NULL,                -- Content of the reminder
    timeAdded TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp when the reminder is added
    notiTime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Notification time for the reminder
    isNotified BOOLEAN DEFAULT FALSE      -- Whether the reminder has been notified (optional)
);
