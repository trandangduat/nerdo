const addOffset = (date, offsetInMs) => {
    if (typeof offsetInMs !== 'number') {
        console.log("offset khong phai la number");
        return;
    }
    let newDate = new Date(date);
    newDate.setTime(newDate.getTime() + offsetInMs);
    return newDate;
};
export const hourToMs = (hour) => {
    return hour * 60 * 60 * 1000;
};
export const minuteToMs = (minute) => {
    return minute * 60 * 1000;
};
const getTimeOffsetWithServer = (utcOffsetInMs) => {
    return -(minuteToMs(new Date().getTimezoneOffset()) + utcOffsetInMs);
};
/**
 * Trích lời nhắc từ định dạng <DD/MM/YY> <hh:mm> <Nội dung lời nhắc>
 */
export const parseReminder = (text, utcOffsetInMs) => {
    const regex = /(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(.+)/;
    const match = text.match(regex);
    if (!match) {
        return null;
    }
    const [_, date, time, content] = match;
    const [day, month, year] = date.split('/').map(Number);
    const [hours, minutes] = time.split(':').map(Number);

    const D = new Date(year + 2000, month - 1, day, hours, minutes);
    const offset = getTimeOffsetWithServer(utcOffsetInMs);
    // console.log(utcOffsetInMs, minuteToMs(new Date().getTimezoneOffset()));
    const notiTime = addOffset(D, offset).toISOString();
    return { content, notiTime };
}

export const toReminderString = (reminder, notiTime, utcOffset) => { // Convert to format: DD/MM/YY hh:mm reminder
    const d = addOffset(new Date(notiTime), -getTimeOffsetWithServer(utcOffset));
    const date = d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
    });
    const time = d.toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit"
    });
    return `${date} ${time} ${reminder}`;
}

export const formatTime = (date, utcOffset) => {
    const d = addOffset(new Date(date), -getTimeOffsetWithServer(utcOffset));
    return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

export const removeBeginningMention = (text) => {
    let textArr = text.split(" ");
    textArr.shift();
    return textArr.join(" ");
}
const SPECIAL_CHARS = [ '\\', '_', '*', '[', ']', '(', ')', '~', '`', '>', '<', '&', '#', '+', '-', '=', '|', '{', '}', '.', '!' ];
export const escapeMarkdown = (text) => {
    SPECIAL_CHARS.forEach(char => (text = text.replaceAll(char, `\\${char}`)));
    return text;
}
export const styleReminder = (reminderId, content, notiTime, utcOffset) => {
    return `Lời nhắc \\#${reminderId}:\n🔔 *${escapeMarkdown(content)}*\n🕒 _${formatTime(notiTime, utcOffset)}_\n\n`;
};
