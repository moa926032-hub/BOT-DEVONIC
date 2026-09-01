/**
 * بحث تيك توك — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تستخدم أزراراً تفاعلية لم يعد واتساب يوصّلها، و API
 * يرجع 403. الآن: مزوّدات متعددة + إرسال الفيديو مباشرة.
 *
 *   .بحث_تيك <كلمة>
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['بحث_تيك', 'بحث_تيكتوك', 'ttsearch'],
    description: 'البحث في تيك توك وإرسال أفضل نتيجة',
    usage: '.بحث_تيك قطط',
    category: 'search',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        let query = (args.join(' ') || '').trim();
        if (!query) query = body.slice(prefix.length).trim().split(/\s+/).slice(1).join(' ').trim();

        if (!query) {
            return send.reply(sock, msg, `*🫯 اكتب كلمة البحث بعد الأمر*\n\nمثال:\n${prefix}بحث_تيك قطط`);
        }

        await send.react(sock, msg, '🔎');

        let results;
        try {
            results = await media.searchTikTok(query, 5);
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg,
                `❌ فشل البحث في تيك توك.\n*السبب:* ${error.message}\n\n` +
                `يمكنك بدلاً من ذلك إرسال رابط الفيديو مع *${prefix}تيك*`
            );
        }

        if (!results.length) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `⚠️ لا توجد نتائج لـ "${query}"`);
        }

        const best = results[0];
        const caption = [
            `╭─ 🎵 *بحث تيك توك:* ${query}`,
            `│ 📝 ${best.title || 'بدون عنوان'}`,
            best.author ? `│ 👤 ${best.author}` : null,
            best.views ? `│ 👁️ ${media.humanViews(best.views)}` : null,
            best.likes ? `│ ❤️ ${media.humanViews(best.likes)}` : null,
            `╰────────────`,
            '',
            `📣 قناتنا: ${config.channel?.link || ''}`,
            '',
            `> ${config.botName}`
        ].filter(Boolean).join('\n');

        try {
            await send.sendVideo(sock, msg, best.video, caption);
            await send.react(sock, msg, '✅');

            if (results.length > 1) {
                const rest = results.slice(1).map((item, index) =>
                    `${index + 2}. ${item.title || 'بدون عنوان'}${item.author ? ` — ${item.author}` : ''}`
                ).join('\n');
                await send.reply(sock, msg, `*نتائج أخرى:*\n${rest}\n\n> ${config.botName}`);
            }
        } catch (error) {
            await send.react(sock, msg, '❌');
            await send.reply(sock, msg, `❌ فشل إرسال الفيديو: ${error.message}`);
        }
    }
};
