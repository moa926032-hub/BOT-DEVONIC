/**
 * طبقة الهوية والتوجيه — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * الغرض: أي رسالة يرسلها البوت (نص، صورة، فيديو، صوت، ملصق، مستند...)
 * تظهر للمستقبل على أنها *معاد توجيهها* من قناة الواتساب الرسمية.
 *
 * الطريقة: نلفّ الدالة sock.sendMessage مرة واحدة عند الاتصال، فتُطبَّق
 * الهوية على كل الإضافات تلقائياً دون تعديل أي بلوجن.
 */

const config = require('../config');
const logger = require('./console');

/** أنواع المحتوى التي لا يجوز إضافة contextInfo لها */
const SKIP_KEYS = [
    'react',
    'delete',
    'edit',
    'protocolMessage',
    'disappearingMessagesInChat',
    'pin',
    'keep',
    'forward'
];

/** بناء كائن التوجيه من القناة */
function newsletterContext(extra = {}) {
    const channel = config.channel || {};
    if (!channel.enabled || !channel.jid) return { ...extra };

    return {
        isForwarded: true,
        forwardingScore: Number(channel.forwardingScore) || 999,
        forwardedNewsletterMessageInfo: {
            newsletterJid: channel.jid,
            newsletterName: channel.name || config.botName,
            serverMessageId: Number(channel.serverMessageId) || 200
        },
        ...extra
    };
}

/** دمج contextInfo الموجود مسبقاً مع هوية القناة دون إتلافه */
function mergeContext(existing) {
    const base = newsletterContext();
    if (!existing || typeof existing !== 'object') return base;

    return {
        ...base,
        ...existing,
        // نفرض دائماً معلومات القناة حتى لو حدّد البلوجن قناة أخرى قديمة
        isForwarded: true,
        forwardingScore: base.forwardingScore ?? existing.forwardingScore,
        forwardedNewsletterMessageInfo:
            base.forwardedNewsletterMessageInfo ||
            existing.forwardedNewsletterMessageInfo
    };
}

function shouldSkip(jid, content) {
    if (!content || typeof content !== 'object') return true;
    if (Array.isArray(content)) return true;
    if (String(jid || '') === 'status@broadcast') return true;
    if (content.__noBrand === true) return true;
    return SKIP_KEYS.some(key => key in content);
}

/**
 * تركيب الهوية على كل رسائل البوت.
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 */
function applyBranding(sock) {
    if (!sock || typeof sock.sendMessage !== 'function') return sock;
    if (sock.__devonicBranded) return sock;

    const originalSendMessage = sock.sendMessage.bind(sock);

    sock.sendMessage = async (jid, content, options = {}) => {
        try {
            if (shouldSkip(jid, content)) {
                if (content && typeof content === 'object' && '__noBrand' in content) {
                    const { __noBrand, ...clean } = content;
                    return originalSendMessage(jid, clean, options);
                }
                return originalSendMessage(jid, content, options);
            }

            const branded = {
                ...content,
                contextInfo: mergeContext(content.contextInfo)
            };

            return await originalSendMessage(jid, branded, options);
        } catch (error) {
            // في حال رفض واتساب الرسالة بسبب contextInfo نعيد المحاولة بدونه
            logger.warn(`تعذر إرسال الرسالة مع هوية القناة (${error.message}) — إعادة المحاولة بدونها`);
            try {
                const { contextInfo, __noBrand, ...clean } = content || {};
                return await originalSendMessage(jid, clean, options);
            } catch (retryError) {
                throw retryError;
            }
        }
    };

    sock.__devonicBranded = true;
    sock.newsletterContext = newsletterContext;
    logger.success('تم تفعيل هوية القناة على كل رسائل البوت');
    return sock;
}

/** ذيل موحّد لكل الرسائل النصية */
function brandFooter() {
    return `\n\n> ${config.botName}`;
}

module.exports = {
    applyBranding,
    newsletterContext,
    mergeContext,
    brandFooter
};
