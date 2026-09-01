/**
 * أمر التحميل الشامل — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * أعطال النسخة القديمة التي تم إصلاحها:
 *  • كان يقرأ نص الأمر من extendedTextMessage فقط، والرسائل العادية
 *    تأتي في conversation → فكان يخرج دائماً برسالة "الاستخدام".
 *  • لم يكن المعالج يمرّر args للأوامر أصلاً.
 *  • كان يعتمد على yt-dlp بشكل مباشر بدون التحقق من وجوده أو تثبيته.
 *  • لم يكن هناك حد لحجم الملف فتفشل الإرسال بصمت.
 *
 * الاستخدام:
 *   .تحميل <رابط>            → فيديو
 *   .تحميل صوت <رابط>        → صوت mp3
 *   .تحميل فيديو <رابط>      → فيديو
 */

const media = require('../utils/media');
const send = require('../utils/send');
const config = require('../config');

const AUDIO_WORDS = ['صوت', 'اغنيه', 'أغنية', 'اغنية', 'mp3', 'audio', 'sound'];
const VIDEO_WORDS = ['فيديو', 'فديو', 'mp4', 'video'];

module.exports = {
    command: ['تحميل', 'دن', 'download', 'dl'],
    description: 'تحميل فيديو أو صوت من يوتيوب، تيك توك، إنستغرام، فيسبوك، تويتر وغيرها',
    usage: '.تحميل صوت <رابط>',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const chatId = msg.key.remoteJid;
        const body = send.bodyOf(msg);
        const prefix = config.prefix;

        // نبني قائمة الكلمات من args، وإن كانت فارغة نستخرجها من نص الرسالة
        let words = Array.isArray(args) && args.length
            ? [...args]
            : body.slice(prefix.length).trim().split(/\s+/).slice(1);

        const url = media.extractUrl(words.join(' ')) || media.extractUrl(body) ||
            media.extractUrl(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '');

        if (!url) {
            return send.reply(sock, msg,
                `╭─ 📥 *التحميل*\n` +
                `│ ${prefix}تحميل <رابط>            ← فيديو\n` +
                `│ ${prefix}تحميل صوت <رابط>       ← صوت\n` +
                `│ ${prefix}تحميل فيديو <رابط>     ← فيديو\n` +
                `╰────────────\n\n` +
                `المنصات المدعومة:\n${media.PLATFORMS.map(item => `• ${item.name}`).join('\n')}\n\n` +
                `> ${config.botName}`
            );
        }

        const hint = words.filter(word => word !== url).join(' ').toLowerCase();
        const mode = AUDIO_WORDS.some(word => hint.includes(word)) ? 'audio'
            : VIDEO_WORDS.some(word => hint.includes(word)) ? 'video'
            : 'video';

        const platform = media.detectPlatform(url);
        await send.react(sock, msg, '⏳');

        let notice;
        try {
            notice = await sock.sendMessage(chatId, {
                text: `⏳ جاري تحميل ${mode === 'audio' ? 'الصوت' : 'الفيديو'}` +
                    `${platform ? ` من *${platform.name}*` : ''}...`
            }, { quoted: msg });
        } catch { /* غير مهم */ }

        let result;
        try {
            result = await media.download(url, mode);
        } catch (error) {
            await send.react(sock, msg, '❌');
            return send.reply(sock, msg,
                `❌ فشل التحميل.\n\n*السبب:* ${error.message}\n\n` +
                `تأكد أن الرابط عام وليس خاصاً، وأن الملف أقل من ${config.media.maxFileSizeMb}MB.`
            );
        }

        const info = result.info || {};
        const caption = [
            `╭─ 📥 *تم التحميل*`,
            `│ 🎬 ${info.title || 'ملف'}`,
            info.uploader ? `│ 👤 ${info.uploader}` : null,
            info.durationText && info.durationText !== 'غير معروف' ? `│ ⏱️ ${info.durationText}` : null,
            `│ 💾 ${result.sizeMb.toFixed(2)} MB`,
            platform ? `│ 🌐 ${platform.name}` : null,
            `╰────────────`,
            '',
            `> ${config.botName}`
        ].filter(Boolean).join('\n');

        try {
            if (mode === 'audio') {
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
            await send.reply(sock, msg, `❌ تم التحميل لكن فشل الإرسال: ${error.message}`);
        } finally {
            media.cleanup(result.all);
            if (notice?.key) {
                await sock.sendMessage(chatId, { delete: notice.key }).catch(() => {});
            }
        }
    }
};
