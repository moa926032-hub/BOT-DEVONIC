/**
 * يوتيوب — تحميل مباشر من الرابط — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * النسخة القديمة كانت تعتمد على مكتبة "meowsab" الخارجية، وإذا لم تُثبَّت
 * كان الأمر يردّ برسالة "غير متاح". الآن يعمل عبر محرك yt-dlp الداخلي.
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

const AUDIO_COMMANDS = ['يوت_اغنيه', 'يوت_اغنية', 'ytmp3', 'ytaudio'];

module.exports = {
    command: ['يوتيوب', 'يوت_اغنيه', 'ytmp3', 'ytmp4', 'youtube'],
    description: 'تحميل فيديو أو صوت من رابط يوتيوب',
    usage: '.يوتيوب <رابط>',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const prefix = config.prefix;
        const body = send.bodyOf(msg);
        const invoked = String(msg.command || '').replace(prefix, '').toLowerCase();
        const isAudio = AUDIO_COMMANDS.includes(invoked);

        const url = media.extractUrl(args.join(' ')) || media.extractUrl(body);

        if (!url) {
            return send.reply(sock, msg,
                `*❲ ❤️ ❳ ضع رابط يوتيوب بعد الأمر ❲ 💙 ❳*\n\n` +
                `مثال:\n${prefix}${invoked || 'يوتيوب'} https://youtu.be/xxxxxxxx\n\n` +
                `للبحث بالاسم استخدم: ${prefix}${isAudio ? 'اغنيه' : 'فيديو'} <اسم الأغنية>`
            );
        }

        if (!/youtube\.com|youtu\.be|music\.youtube/i.test(url)) {
            return send.reply(sock, msg, '❌ هذا ليس رابط يوتيوب. استخدم أمر *.تحميل* للمنصات الأخرى.');
        }

        await send.react(sock, msg, '⏳');

        let result;
        try {
            result = await media.download(url, isAudio ? 'audio' : 'video');
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg, `❌ فشل التحميل من يوتيوب.\n*السبب:* ${error.message}`);
        }

        const info = result.info || {};
        const caption = [
            `╭─ 🐞 *YouTube | ${isAudio ? 'أغاني' : 'فيديوز'}*`,
            `│ 📽️ ${info.title}`,
            info.uploader ? `│ 📢 ${info.uploader}` : null,
            info.durationText !== 'غير معروف' ? `│ ⏳ ${info.durationText}` : null,
            `│ 💾 ${result.sizeMb.toFixed(2)} MB`,
            `╰────────────`,
            '',
            `> ${config.botName}`
        ].filter(Boolean).join('\n');

        try {
            if (isAudio) {
                await send.sendAudio(sock, msg, result.file, {
                    fileName: `${(info.title || 'audio').slice(0, 60)}.mp3`,
                    contextInfo: send.adReply({
                        title: info.title,
                        body: info.uploader,
                        thumbnailUrl: info.thumbnail
                    })
                });
                await send.reply(sock, msg, caption);
            } else {
                await send.sendVideo(sock, msg, result.file, caption);
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
