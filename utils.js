/**
 * Trích lời nhắc từ định dạng <DD/MM/YY> <hh:mm> <Nội dung lời nhắc>
 */
export const parseReminder = (text) => {
    const regex = /(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(.+)/;
    const match = text.match(regex);
    if (!match) {
        return null;
    }
    const [_, date, time, content] = match;
    const [day, month, year] = date.split('/').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    const notiTime = new Date(year + 2000, month - 1, day, hours, minutes).toISOString();
    return { content, notiTime };
}

export const toReminderString = (reminder, notiTime) => { // Convert to format: DD/MM/YY hh:mm reminder
    const d = new Date(notiTime);
    const date = d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit"
    });
    const time = d.toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit"
    });
    return `${date} ${time} ${reminder}`;
}

export const formatTime = (date) => {
    return new Date(date).toLocaleString("en-GB", {
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
