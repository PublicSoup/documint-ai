// Quick test of gemini-2.5-flash with new API key
const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = "AIzaSyABh39uH39B9VgrqHtTzunyDzIshMKnYE0";

async function test() {
    const genAI = new GoogleGenerativeAI(API_KEY);

    try {
        console.log("Testing gemini-2.5-flash...");
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent("Say hello");
        console.log("✅ SUCCESS:", result.response.text().slice(0, 100));
    } catch (e) {
        console.log("❌ FAILED:", e.message);
    }
}

test();
