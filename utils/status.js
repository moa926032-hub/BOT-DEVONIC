/**
 * مراقب الحالات (الاستوريهات) — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * الوظيفة:
 *  1) مشاهدة أي استوري لحظة نشرها (بدون تأخير) ليكون البوت أول المشاهدين.
 *  2) التفاعل معها تلقائياً بقلب ❤️.
 */

const config = require('../config');
const logger = require('./console');

const handled = new Set();

function remember(id) {
    if (!id) return false;
    if (handled.has(id)) return true;
    handled.add(id);
    if (handled.size > 4000) {
        // تنظيف بسيط لمنع تضخم الذاكرة
        const iterator = handled.values();
        for (let index = 0; index < 1500; index += 1) handled.delete(iterator.next().value);
    }
    return false;
}

function isStatus(message) {
    return message?.key?.remoteJid === 'status@broadcast';
}

function pureNumber(jid) {
    return String(jid || '').replace(/[:@].*/g, '').replace(/[^0-9]/g, '');
}

/**
 * معالجة استوري واحد.
 * @returns {Promise<boolean>} true إذا كانت الرسالة استوري وتم التعامل معها
 */
async function handleStatus(sock, message) {
    if (!isStatus(message)) return false;

    const settings = config.status || {};
    if (!settings.autoView && !settings.autoReact) return true;

    const key = message.key;
    if (remember(key?.id)) return true;

    const author = key.participant || message.participant || '';
    const botNumber = pureNumber(sock?.user?.id);

    if (settings.skipOwnStatus && botNumber && pureNumber(author) === botNumber) return true;

    if (Number(settings.delayMs) > 0) {
        await new Promise(resolve => setTimeout(resolve, Number(settings.delayMs)));
    }

    /* 1) المشاهدة الفورية */
    if (settings.autoView) {
        try {
            await sock.readMessages([key]);
        } catch (error) {
            logger.warn(`تعذر تسجيل مشاهدة الاستوري: ${error.message}`);
        }
    }

    /* 2) التفاعل بقلب */
    if (settings.autoReact) {
        const emoji = settings.emoji || '❤️';
        try {
            await sock.sendMessage(
                'status@broadcast',
                { react: { text: emoji, key } },
                { statusJidList: author ? [author] : undefined }
            );
            logger.success(`❤️ تم التفاعل مع استوري: ${pureNumber(author) || 'غير معروف'}`);
        } catch (error) {
            // بعض إصدارات واتساب ترفض الشكل الأول، نجرب الشكل البديل
            try {
                await sock.sendMessage('status@broadcast', {
                    react: { text: emoji, key: { ...key, participant: author } }
                });
                logger.success(`❤️ تم التفاعل مع استوري (طريقة بديلة): ${pureNumber(author)}`);
            } catch (fallbackError) {
                logger.warn(`تعذر التفاعل مع الاستوري: ${fallbackError.message}`);
            }
        }
    }

    return true;
}

/** ربط المراقب بمقبس الاتصال (كخيار مستقل عن المعالج الرئيسي) */
function attach(sock) {
    if (!sock || sock.__devonicStatusWatcher) return sock;
    sock.__devonicStatusWatcher = true;

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const message of messages || []) {
            if (!isStatus(message)) continue;
            await handleStatus(sock, message).catch(() => {});
        }
    });

    logger.success('تم تفعيل مشاهدة الاستوريهات والتفاعل التلقائي بقلب');
    return sock;
}

module.exports = { attach, handleStatus, isStatus };
