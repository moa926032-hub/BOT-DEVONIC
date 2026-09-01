/**
 * بحث الصور / بينترست — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تنادي bot.Api.search.pinterestImages وهو غير موجود
 * في هذا البوت (undefined) فيسقط الأمر دائماً، إضافة إلى sendCarousel الذي
 * لم يعد واتساب يوصّله. الآن: مزوّد بينترست الرسمي + مصدر احتياطي، وإرسال
 * الصور كألبوم عادي.
 *
 *   .بين <كلمة>            → 5 صور
 *   .بين <كلمة> | 8        → عدد مخصص (حتى 10)
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['بين', 'بينترست', 'pinterest', 'صور', 'image'],
    description: 'البحث عن صور وإرسالها',
    usage: '.بين cars',
    category: 'search',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        let raw = (args.join(' ') || '').trim();
        if (!raw) raw = body.slice(prefix.length).trim().split(/\s+/).slice(1).join(' ').trim();

        if (!raw) {
            return send.reply(sock, msg,
                `*💙 اكتب اسم البحث بعد الأمر ❤️*\n\n` +
                `مثال:\n${prefix}بين cars\n${prefix}بين cars | 8`
            );
        }

        // دعم تحديد العدد بعد علامة |
        const [queryPart, countPart] = raw.split('|');
        const query = queryPart.trim();
        const count = Math.min(Math.max(parseInt(countPart, 10) || 5, 1), 10);

        await send.react(sock, msg, '🔎');

        let results;
        try {
            results = await media.searchImages(query, count);
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ فشل البحث عن الصور.\n*السبب:* ${error.message}`);
        }

        if (!results.length) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, '*⚠️ لا توجد نتائج للبحث*');
        }

        let sent = 0;
        for (const [index, item] of results.entries()) {
            const caption = [
                `📸 *${item.title || query}*`,
                item.owner ? `👤 ${item.owner}` : null,
                `🔢 ${index + 1} / ${results.length}`,
                '',
                `> ${config.botName}`
            ].filter(Boolean).join('\n');

            try {
                await send.sendImage(sock, msg, item.url, caption);
                sent += 1;
            } catch {
                // نتجاهل الصورة التي يفشل تحميلها ونكمل الباقي
            }
        }

        if (!sent) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, '❌ تم إيجاد نتائج لكن تعذر إرسال أي صورة.');
        }

        await send.react(sock, msg, '✅');
    }
};
