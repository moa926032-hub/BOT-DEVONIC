/**
 * إنستغرام — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تنتظر كائن Api في سياق التنفيذ وهو غير موجود، لذلك
 * كان الأمر يسقط بخطأ "Cannot read properties of undefined". الآن يعمل عبر
 * محرك التحميل الداخلي.
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['انستا', 'إنستا', 'instagram', 'ig'],
    description: 'تحميل فيديو أو صورة من إنستغرام',
    usage: '.انستا <رابط>',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        const url = media.extractUrl(args.join(' ')) || media.extractUrl(body);

        if (!url) {
            return send.reply(sock, msg,
                `❌ ضع رابط إنستغرام بعد الأمر.\n\nمثال:\n${prefix}انستا https://www.instagram.com/reel/xxxx/`
            );
        }

        if (!/instagram\.com|instagr\.am/i.test(url)) {
            return send.reply(sock, msg, '❌ هذا ليس رابط إنستغرام.');
        }

        await send.react(sock, msg, '⏳');

        let result;
        try {
            result = await media.download(url, 'video');
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg,
                `❌ فشل التحميل من إنستغرام.\n*السبب:* ${error.message}\n\n` +
                'تأكد أن الحساب عام (غير خاص) وأن المنشور متاح للجميع.'
            );
        }

        const info = result.info || {};
        const caption = [
            `╭─ 📸 *Instagram*`,
            info.title && info.title !== 'ملف' ? `│ 📝 ${info.title}` : null,
            info.uploader ? `│ 👤 ${info.uploader}` : null,
            `│ 💾 ${result.sizeMb.toFixed(2)} MB`,
            `╰────────────`,
            '',
            `> ${config.botName}`
        ].filter(Boolean).join('\n');

        const isImage = /\.(jpe?g|png|webp)$/i.test(result.file);

        try {
            if (isImage) {
                await send.sendImage(sock, msg, result.file, caption);
            } else {
                await send.sendVideo(sock, msg, result.file, caption);
            }
            await send.react(sock, msg, '✅');
        } catch (error) {
            await send.react(sock, msg, '❌');
            await send.reply(sock, msg, `❌ فشل الإرسال: ${error.message}`);
        } finally {
            media.cleanup(result.all);
        }
    }
};
