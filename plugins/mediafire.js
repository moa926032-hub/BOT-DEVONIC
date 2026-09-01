/**
 * ميديا فاير — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تعتمد على API خارجي متوقف، وكانت تكتم الأخطاء تماماً
 * (console.log فقط) فيبدو الأمر كأنه لا يعمل. الآن: استخراج الرابط مباشرة
 * من صفحة ميديا فاير مع رسائل خطأ واضحة.
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['ميديافاير', 'mf', 'mediafire'],
    description: 'تحميل ملف من ميديا فاير',
    usage: '.ميديافاير <رابط>',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        const url = media.extractUrl(args.join(' ')) || media.extractUrl(body);

        if (!url) {
            return send.reply(sock, msg,
                `*❲ 📁 ❳ ضع رابط ميديا فاير بعد الأمر*\n\n` +
                `مثال:\n${prefix}ميديافاير https://www.mediafire.com/file/xxxxx/file`
            );
        }

        if (!/mediafire\.com/i.test(url)) {
            return send.reply(sock, msg, '❌ هذا ليس رابط ميديا فاير.');
        }

        await send.react(sock, msg, '📥');

        let info;
        try {
            info = await media.mediafire(url);
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ فشل في جلب المعلومات.\n*السبب:* ${error.message}`);
        }

        try {
            await send.sendDocument(sock, msg, info.downloadUrl, {
                fileName: info.filename,
                mimetype: 'application/octet-stream',
                caption: [
                    `╭─ 📁 *MediaFire*`,
                    `│ 📄 ${info.filename}`,
                    info.size ? `│ 💾 ${info.size}` : null,
                    `╰────────────`,
                    '',
                    `> ${config.botName}`
                ].filter(Boolean).join('\n')
            });
            await send.react(sock, msg, '✅');
        } catch (error) {
            await send.react(sock, msg, '❌');
            await send.reply(sock, msg,
                `❌ تعذر إرسال الملف (قد يكون حجمه كبيراً).\n\n` +
                `📄 ${info.filename}${info.size ? ` (${info.size})` : ''}\n` +
                `🔗 رابط التحميل المباشر:\n${info.downloadUrl}`
            );
        }
    }
};
