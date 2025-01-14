const NOTE = "Xem danh sách lời nhắc và thêm, xoá, sửa bằng lệnh '/start'.";

export const ADD_REMINDER_INSTRUCTION = "Vui lòng gửi lời nhắc theo định dạng:\n\n`<DD/MM/YY> <hh:mm> <Nội dung lời nhắc>`\n\nVí dụ: `01/02/25 18:30 Đi mua đồ ăn`";
export const REMOVE_REMINDER_INSTRUCTION = "Vui lòng gửi ID của lời nhắc bạn muốn xoá.";
export const EDIT_REMINDER_ID_ASK = "Vui lòng gửi ID của lời nhắc bạn muốn sửa.";
export const EDIT_REMINDER_INSTRUCTION = "Vui lòng gửi lời nhắc mới theo định dạng:\n\n`<DD/MM/YY> <hh:mm> <Nội dung lời nhắc>`";
export const REMINDER_SAVED_SUCCESS = `Đã lưu thành công lời nhắc!\n${NOTE}`;
export const REMINDER_DELETED_SUCCESS = `Đã xoá thành công lời nhắc!\n${NOTE}`;
export const REMINDER_EDITED_SUCCESS = `Đã sửa thành công lời nhắc!\n${NOTE}`;
export const WRONG_REMINDER_FORMAT = "Sai định dạng, vui lòng gửi theo đúng định dạng \n\n`<DD/MM/YY> <hh:mm> <Nội dung lời nhắc>`";
export const REMINDER_DATE_IN_PAST_ERROR = "Thời gian đặt lời nhắc đã ở trong quá khứ, vui lòng chọn thời gian trong tương lai.";
export const WRONG_REMINDER_ID = "Sai định dạng ID lời nhắc hoặc ID lời nhắc không tồn tại.";
export const UPDATE_TIMEZONE_INSTRUCTION = "Vui lòng gửi số giờ lệch so với chuẩn GMT/UTC. Ví dụ GMT+7 thì nhập 7.";
export const UPDATE_TIMEZONE_SUCCESS = "Cập nhật timezone thành công!";
export const UPDATE_TIMEZONE_FIRST = "Vui lòng cập nhật timezone trước khi thực hiện các hành động khác.";
