/**
 * مساعدات الإرسال — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 * توحيد إرسال النصوص والوسائط مع تنظيف الملفات المؤقتة تلقائياً.
 */

const fs = require('fs');
const config = require('../config');

function chatOf(msg) {
    return msg?.key?.remoteJid;
}

async function reply(sock, msg, text, extra = {}) {
    return sock.sendMessage(chatOf(msg), { text, ...extra }, { quoted: msg });
}

async function react(sock, msg, emoji) {
    try {
        await sock.sendMessage(chatOf(msg), { react: { text: emoji, key: msg.key } });
    } catch { /* التفاعل ليس حرجاً */ }
}

/** بناء ترويسة إعلانية موحّدة (تعطي الرسالة شكل بطاقة) */
function adReply({ title, body, thumbnailUrl, sourceUrl }) {
    return {
        externalAdReply: {
            title: title || config.botName,
            body: body || config.channel?.name || config.teamName,
            thumbnailUrl: thumbnailUrl || '',
            sourceUrl: sourceUrl || config.channel?.link || '',
            mediaType: 1,
            renderLargerThumbnail: Boolean(thumbnailUrl)
        }
    };
}

function mediaSource(target) {
    if (!target) throw new Error('لا يوجد ملف للإرسال');
    if (typeof target === 'object') return target;
    if (/^https?:\/\//i.test(target)) return { url: target };
    return fs.readFileSync(target);
}

async function sendVideo(sock, msg, target, caption = '', extra = {}) {
    return sock.sendMessage(chatOf(msg), {
        video: mediaSource(target),
        mimetype: 'video/mp4',
        caption,
        ...extra
    }, { quoted: msg });
}

async function sendAudio(sock, msg, target, extra = {}) {
    return sock.sendMessage(chatOf(msg), {
        audio: mediaSource(target),
        mimetype: 'audio/mpeg',
        ptt: false,
        ...extra
    }, { quoted: msg });
}

async function sendImage(sock, msg, target, caption = '', extra = {}) {
    return sock.sendMessage(chatOf(msg), {
        image: mediaSource(target),
        caption,
        ...extra
    }, { quoted: msg });
}

async function sendDocument(sock, msg, target, { fileName, mimetype, caption } = {}) {
    return sock.sendMessage(chatOf(msg), {
        document: mediaSource(target),
        fileName: fileName || 'file',
        mimetype: mimetype || 'application/octet-stream',
        caption: caption || ''
    }, { quoted: msg });
}

/** استخراج نص الرسالة الكامل */
function bodyOf(msg) {
    return msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        msg?.message?.imageMessage?.caption ||
        msg?.message?.videoMessage?.caption ||
        '';
}

module.exports = {
    reply,
    react,
    adReply,
    sendVideo,
    sendAudio,
    sendImage,
    sendDocument,
    bodyOf,
    chatOf
};
