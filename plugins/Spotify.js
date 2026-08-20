function getScrapy() {
  try {
    return require("meowsab").Scrapy;
  } catch {
    return null;
  }
}

let handler = async (m, { conn, text }) => {
  const Scrapy = getScrapy();
  if (!Scrapy) return m.reply("❌ أمر Spotify غير متاح حاليًا لتقليل مكاتب التثبيت.");
  if (!text) return m.reply("مثال: .سبوتيفاي https://open.spotify.com/track/3XiolLAtcY6wi28QyZ9vDO?si=ScKGlkeMQ0GMAkhzuggeYQ");
  m.react("⏳")
  
  const { data } = await Scrapy.spotify(text);
  
  if (!data) return m.reply("❌ : حصل مشكله في التحميل أتأكد من الرابط");
  
  await conn.sendMessage(m.chat, { 
    audio: { url: data.download }, 
    mimetype: 'audio/mpeg',
    fileName: `${data.name}.mp3`
  }, { quoted: m });
  m.react("✅")
}

handler.usage = ["سبوتيفاي"];
handler.command = ["سبوتيفاي", "spotify"];
handler.category = "downloads";

module.exports = handler;