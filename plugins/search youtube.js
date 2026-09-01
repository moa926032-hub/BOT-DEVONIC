/**
 * بحث يوتيوب (قائمة نتائج) — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *   .بحث <كلمة البحث>
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['بحث', 'بحث_يوت', 'yts', 'ytsearch'],
    description: 'البحث في يوتيوب وعرض النتائج مع روابطها',
    usage: '.بحث اسم الأغنية',
    category: 'search',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        let query = (args.join(' ') || '').trim();
        if (!query) query = body.slice(prefix.length).trim().split(/\s+/).slice(1).join(' ').trim();

        if (!query) {
            return send.reply(sock, msg,
                `*🔎 اكتب كلمة البحث بعد الأمر*\n\nمثال:\n${prefix}بحث تلاوة الشيخ الحصري`
            );
        }

        await send.react(sock, msg, '🔎');

        let results;
        try {
            results = await media.searchYouTube(query, config.media.searchResults);
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ فشل البحث.\n*السبب:* ${error.message}`);
        }

        if (!results.length) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `⚠️ لا توجد نتائج لـ "${query}"`);
        }

        const lines = [`╭─ 🔎 *نتائج البحث:* ${query}`, '│'];
        results.forEach((item, index) => {
            lines.push(`│ *${index + 1}.* ${item.title}`);
            lines.push(`│ ⏱️ ${item.durationText}  •  👁️ ${media.humanViews(item.views)}`);
            if (item.channel) lines.push(`│ 📢 ${item.channel}`);
            lines.push(`│ 🔗 ${item.url}`);
            lines.push('│');
        });
        lines.push('╰────────────');
        lines.push('');
        lines.push(`⬇️ للتحميل: *${prefix}اغنيه <الاسم>* أو *${prefix}تحميل <الرابط>*`);
        lines.push('');
        lines.push(`> ${config.botName}`);

        await send.react(sock, msg, '✅');

        return send.reply(sock, msg, lines.join('\n'), {
            contextInfo: send.adReply({
                title: `نتائج: ${query}`,
                body: config.botName,
                thumbnailUrl: results[0].thumbnail,
                sourceUrl: results[0].url
            })
        });
    }
};
