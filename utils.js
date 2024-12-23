/**
 * Trích lời nhắc từ định dạng <DD-MM-YY> <hh:mm> <Nội dung lời nhắc>
 */
export const parseReminder = (text) => {
    const regex = /(\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)/;
    const match = text.match(regex);
    if (!match) {
        throw new Error("Invalid reminder format. Expected format: <DD-MM-YY> <hh:mm> <Nội dung lời nhắc>");
    }
    const [_, date, time, content] = match;
    const [day, month, year] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    const notiTime = new Date(year + 2000, month - 1, day, hours, minutes);
    return { content, notiTime };
}
