/**
 * سبوتيفاي — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تعتمد على مكتبة meowsab الخارجية فتوقفت. الآن:
 * نقرأ اسم الأغنية من سبوتيفاي ثم نحضر النسخة الصوتية عبر محرك التحميل.
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

module.exports = {
    command: ['سبوتيفاي', 'spotify', 'سبوتي'],
    description: 'تحميل أغنية من رابط سبوتيفاي',
    usage: '.سبوتيفاي <رابط>',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        const url = media.extractUrl(args.join(' ')) || media.extractUrl(body);

        if (!url) {
            return send.reply(sock, msg,
                `مثال:\n${prefix}سبوتيفاي https://open.spotify.com/track/3XiolLAtcY6wi28QyZ9vDO`
            );
        }

        if (!/open\.spotify\.com/i.test(url)) {
            return send.reply(sock, msg, '❌ هذا ليس رابط سبوتيفاي.');
        }

        await send.react(sock, msg, '⏳');

        let result;
        try {
            result = await media.spotify(url);
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ حصلت مشكلة في التحميل، تأكد من الرابط.\n*السبب:* ${error.message}`);
        }

        const info = result.info || {};
        const title = result.spotifyTitle || info.title || 'أغنية';

        try {
            await send.sendAudio(sock, msg, result.file, {
                fileName: `${title.slice(0, 60)}.mp3`,
                contextInfo: send.adReply({
                    title,
                    body: info.uploader || 'Spotify',
                    thumbnailUrl: info.thumbnail,
                    sourceUrl: url
                })
            });

            await send.reply(sock, msg, [
                `╭─ 🎧 *Spotify*`,
                `│ 🎵 ${title}`,
                `│ 💾 ${result.sizeMb.toFixed(2)} MB`,
                `╰────────────`,
                '',
                `> ${config.botName}`
            ].join('\n'));

            await send.react(sock, msg, '✅');
        } catch (error) {
            await send.react(sock, msg, '❌');
            await send.reply(sock, msg, `❌ فشل الإرسال: ${error.message}`);
        } finally {
            media.cleanup(result.all);
        }
    }
};
