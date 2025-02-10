import { GoogleGenerativeAI } from "@google/generative-ai";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from 'ai';

const SYSTEM_INSTRUCTION = `
	Bạn là trợ lý tạo lời nhắc.

	Chuyển yêu cầu thành định dạng: DD/MM/YY HH:MM <Nội dung>.

	Ví dụ:
	- "Nhắc tôi mua đồ lúc 6 giờ chiều mai" -> "16/06/24 18:00 Mua đồ"
	- "Lịch họp team 10 giờ sáng 2 ngày nữa" -> "17/06/24 10:00 Lịch họp team"
	- "Nhắc đi ngủ 11h tối" -> "15/06/24 23:00 Nhắc đi ngủ"
	- "Tập thể dục 7h30 sáng thứ 6 tuần sau" -> "21/06/24 07:30 Tập thể dục"
	- "20/12/24 3 giờ chiều có hẹn nha khoa" -> "20/12/24 15:00 Hẹn nha khoa"

	Nếu không rõ năm, dùng năm hiện tại.
	Nếu không rõ ngày, dùng hôm nay hoặc ngày mai nếu thời gian là tương lai.

	Trích xuất chính xác ngày, giờ, phút và nội dung.

	KHÔNG thêm thông tin khác.
`;

export const initGenAI = () => {
	let model;
	switch (process.env.GEN_AI_PROVIDER) {
		case "groq":
			model = createGroq({
				apiKey: process.env.GROQ_API_KEY,
			});
			break;

		case "gemini":
			const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
			const instruction = SYSTEM_INSTRUCTION;
			model = genAI.getGenerativeModel({
				model: "gemini-2.0-flash-exp",
				systemInstruction: instruction,
			});
			break;
	}

    return model;
};

export const genReminderFromRequest = async(ai, request) => {
	console.time("gen reminder");
	let text, result;
	switch (process.env.GEN_AI_PROVIDER) {
		case "groq":
			result = await generateText({
				model: ai('llama-3.3-70b-specdec'),
				messages: [
					{
						role: 'system',
						content: SYSTEM_INSTRUCTION,
					},
					{
						role: 'user',
						content: request,
					}
				]
			});
			text = result.text;
			break;

		case "gemini":
			result = await ai.generateContent(request);
			text = result.response.text();
			break;
	}
	console.timeEnd("gen reminder");
	return text;
};
