/**
 * البحث والتحميل بالاسم — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تعتمد على أزرار تفاعلية (sendButton) لم يعد واتساب
 * يوصّلها، وعلى API خارجي متوقف. الآن: بحث عبر المحرك الداخلي ثم تحميل
 * أول نتيجة مباشرة (أسرع وأضمن للمستخدم).
 *
 *   .اغنيه <اسم>   → صوت
 *   .فيديو <اسم>   → فيديو
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

const AUDIO_COMMANDS = ['اغنيه', 'اغنية', 'أغنية', 'شغل', 'play', 'song'];

module.exports = {
    command: ['اغنيه', 'اغنية', 'فيديو', 'play', 'video', 'شغل'],
    description: 'البحث بالاسم في يوتيوب وتحميل النتيجة الأولى',
    usage: '.اغنيه عمرو دياب',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const invoked = String(msg.command || '').replace(prefix, '').toLowerCase();
        const isAudio = AUDIO_COMMANDS.includes(invoked);

        const body = send.bodyOf(msg);
        let query = (Array.isArray(args) && args.length ? args.join(' ') : '').trim();
        if (!query) query = body.slice(prefix.length).trim().split(/\s+/).slice(1).join(' ').trim();

        if (!query) {
            return send.reply(sock, msg,
                `*💙 اكتب اسم ${isAudio ? 'الأغنية' : 'الفيديو'} بعد الأمر ❤️*\n\n` +
                `مثال:\n${prefix}${invoked} عمرو دياب تملي معاك`
            );
        }

        // لو المستخدم لصق رابطاً مباشرة نتعامل معه كتحميل عادي
        const direct = media.extractUrl(query);
        await send.react(sock, msg, '🔎');

        let target;
        let results = [];

        try {
            if (direct) {
                target = { url: direct, title: '', channel: '', durationText: '', thumbnail: '' };
            } else {
                results = await media.searchYouTube(query, config.media.searchResults);
                if (!results.length) throw new Error('لا نتائج');
                target = results[0];
            }
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ فشل البحث.\n*السبب:* ${error.message}`);
        }

        const others = results.slice(1, 6);
        const preview = [
            `╭─ 🔎 *نتيجة البحث*`,
            `│ 🎵 ${target.title || query}`,
            target.channel ? `│ 📢 ${target.channel}` : null,
            target.durationText ? `│ ⏱️ ${target.durationText}` : null,
            target.views ? `│ 👁️ ${media.humanViews(target.views)}` : null,
            `╰────────────`,
            '',
            `⏳ جاري تحميل ${isAudio ? 'الصوت' : 'الفيديو'}...`,
            others.length ? `\n*نتائج أخرى:*\n${others.map((item, index) =>
                `${index + 2}. ${item.title} — ${item.durationText}`).join('\n')}` : null,
            '',
            `> ${config.botName}`
        ].filter(Boolean).join('\n');

        await send.reply(sock, msg, preview, {
            contextInfo: send.adReply({
                title: target.title || query,
                body: target.channel || config.botName,
                thumbnailUrl: target.thumbnail,
                sourceUrl: target.url
            })
        });

        let result;
        try {
            result = await media.download(target.url, isAudio ? 'audio' : 'video');
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ فشل التحميل.\n*السبب:* ${error.message}`);
        }

        const info = result.info || {};
        try {
            if (isAudio) {
                await send.sendAudio(sock, msg, result.file, {
                    fileName: `${(info.title || target.title || 'audio').slice(0, 60)}.mp3`,
                    contextInfo: send.adReply({
                        title: info.title || target.title,
                        body: info.uploader || target.channel,
                        thumbnailUrl: info.thumbnail || target.thumbnail,
                        sourceUrl: target.url
                    })
                });
            } else {
                await send.sendVideo(sock, msg, result.file,
                    `🎬 *${info.title || target.title}*\n💾 ${result.sizeMb.toFixed(2)} MB\n\n> ${config.botName}`
                );
            }
            await send.react(sock, msg, '✅');
        } catch (error) {
            await send.react(sock, msg, '❌');
            await send.reply(sock, msg, `❌ فشل إرسال الملف: ${error.message}`);
        } finally {
            media.cleanup(result.all);
        }
    }
};
