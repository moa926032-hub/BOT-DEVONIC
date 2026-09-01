/**
 * فيسبوك — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تقرأ صفحة fdownloader.net، وهي محمية الآن وتغيّر
 * تصميمها فتوقف الأمر تماماً. الآن يعمل عبر محرك التحميل الداخلي.
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['فيس', 'فيسبوك', 'fb', 'fbdl', 'facebook'],
    description: 'تحميل فيديو من فيسبوك',
    usage: '.فيس <رابط>',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        const url = media.extractUrl(args.join(' ')) || media.extractUrl(body);

        if (!url) {
            return send.reply(sock, msg,
                `*❲ ❤️ ❳ ضع رابط الفيديو بعد الأمر ❲ 💙 ❳*\n\n` +
                `مثال:\n${prefix}فيس https://www.facebook.com/reel/xxxxxx`
            );
        }

        if (!/facebook\.com|fb\.watch|fb\.me/i.test(url)) {
            return send.reply(sock, msg, '❌ هذا ليس رابط فيسبوك.');
        }

        await send.react(sock, msg, '🌾');

        let result;
        try {
            result = await media.download(url, 'video');
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg,
                `❌ لا يوجد فيديو متاح للتحميل.\n*السبب:* ${error.message}\n\n` +
                'تأكد أن الفيديو عام وليس مخصصاً للأصدقاء فقط.'
            );
        }

        const info = result.info || {};
        const caption = [
            `╭─ 📘 *Facebook*`,
            info.title && info.title !== 'ملف' ? `│ 📝 ${info.title}` : null,
            info.uploader ? `│ 👤 ${info.uploader}` : null,
            info.durationText !== 'غير معروف' ? `│ ⏱️ ${info.durationText}` : null,
            `│ 💾 ${result.sizeMb.toFixed(2)} MB`,
            msg.pushName ? `│ ✨ بواسطة ${msg.pushName}` : null,
            `╰────────────`,
            '',
            `> ${config.botName}`
        ].filter(Boolean).join('\n');

        try {
            await send.sendVideo(sock, msg, result.file, caption);
            await send.react(sock, msg, '✅');
        } catch (error) {
            await send.react(sock, msg, '❌');
            await send.reply(sock, msg, `❌ فشل الإرسال: ${error.message}`);
        } finally {
            media.cleanup(result.all);
        }
    }
};
