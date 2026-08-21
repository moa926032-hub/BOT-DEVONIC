const fs = require('fs');
const path = require('path');
const { writeFile, mkdir } = require('fs/promises');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { eliteNumbers } = require('../haykala/elite.js');

// دالة التحقق من النخبة
function isElite(sender) {
    return eliteNumbers.includes(sender.split('@')[0]);
}

module.exports = {
    command: 'topng',
    async execute(sock, m) {
        const sender = m.key.participant || m.participant || m.key.remoteJid;

        // التحقق إذا المستخدم من النخبة
        if (!isElite(sender)) {
            return sock.sendMessage(m.key.remoteJid, {
                text: '🚫 هذا الأمر مخصص للأعضاء النخبة فقط!'
            }, { quoted: m });
        }

        try {
            const chatId = m.key.remoteJid;

            // استخراج الملصق من الرسالة أو الرسالة المقتبسة
            const sticker = m.message?.stickerMessage || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;

            if (!sticker) {
                return sock.sendMessage(chatId, {
                    text: '❌ أرسل هذا الأمر مع ملصق فقط!'
                }, { quoted: m });
            }

            // تحميل الملصق
            const stream = await downloadContentFromMessage(sticker, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // إنشاء مجلد مؤقت إن لم يكن موجودًا
            const tempDir = path.join(__dirname, '..', 'temp');
            if (!fs.existsSync(tempDir)) {
                await mkdir(tempDir, { recursive: true });
            }

            // حفظ الصورة مؤقتًا
            const filePath = path.join(tempDir, `sticker_${Date.now()}.jpg`);
            await writeFile(filePath, buffer);

            // إرسال الصورة
            await sock.sendMessage(chatId, {
                image: buffer,
                caption: "🖼️ تم تحويل الملصق إلى صورة."
            }, { quoted: m });

            // حذف الملف المؤقت
            fs.unlinkSync(filePath);

        } catch (error) {
            console.error("❌ خطأ أثناء تحويل الملصق إلى صورة:", error);
            await sock.sendMessage(m.key.remoteJid, {
                text: '❌ حدث خطأ أثناء التحويل، حاول مرة أخرى لاحقًا.'
            }, { quoted: m });
        }
    }
};