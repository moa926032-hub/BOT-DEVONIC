/**
 * تيك توك — تحميل بدون علامة مائية — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تعتمد على قراءة صفحة ssstik.io بـ cheerio، وقد تغيّر
 * تصميم الصفحة فتوقف الأمر. الآن: مزوّد سريع + محرك yt-dlp كخطة بديلة.
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['تيك', 'تيكتوك', 'tiktok', 'tt'],
    description: 'تحميل فيديو تيك توك بدون علامة مائية',
    usage: '.تيك <رابط>',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        const url = media.extractUrl(args.join(' ')) || media.extractUrl(body);

        if (!url) {
            return send.reply(sock, msg,
                `❌ ضع رابط فيديو تيك توك بعد الأمر.\n\n` +
                `مثال:\n${prefix}تيك https://vt.tiktok.com/xxxxxx\n\n` +
                `للبحث بالاسم: ${prefix}بحث_تيك <كلمة>`
            );
        }

        if (!/tiktok\.com|douyin\.com/i.test(url)) {
            return send.reply(sock, msg, '❌ هذا ليس رابط تيك توك. استخدم *.تحميل* للمنصات الأخرى.');
        }

        await send.react(sock, msg, '⏳');

        let data;
        try {
            data = await media.tiktokDownload(url);
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ فشل تحميل الفيديو.\n*السبب:* ${error.message}`);
        }

        const caption = [
            `╭─ 🎵 *TikTok*`,
            data.title ? `│ 📝 ${data.title}` : null,
            data.author ? `│ 👤 ${data.author}` : null,
            `╰────────────`,
            '',
            `> ${config.botName}`
        ].filter(Boolean).join('\n');

        try {
            await send.sendVideo(sock, msg, data.type === 'url' ? data.video : data.file, caption);

            if (data.music) {
                await send.sendAudio(sock, msg, data.music, {
                    fileName: `${(data.title || 'tiktok-audio').slice(0, 50)}.mp3`
                }).catch(() => {});
            }

            await send.react(sock, msg, '✅');
        } catch (error) {
            await send.react(sock, msg, '❌');
            await send.reply(sock, msg, `❌ فشل إرسال الفيديو: ${error.message}`);
        } finally {
            if (data.all) media.cleanup(data.all);
        }
    }
};
