/**
 * شرط جروب المطور — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * عند تشغيل البوت يتم التحقق: هل رقم البوت عضو في جروب المطور؟
 *  • إذا كان عضواً  → يعمل البوت بشكل طبيعي.
 *  • إذا لم يكن     → يحاول الانضمام تلقائياً (إن كان autoJoin مفعّلاً)،
 *                     وإن فشل يتوقف عن تنفيذ الأوامر.
 *
 * يُعاد الفحص دورياً حتى لو تم إخراج البوت من الجروب لاحقاً.
 */

const config = require('../config');
const logger = require('./console');

const state = {
    checked: false,
    member: false,
    groupJid: config.devGroup?.jid || '',
    lastCheck: 0,
    notified: new Set()
};

function pureNumber(value) {
    return String(value || '').replace(/[:@].*/g, '').replace(/[^0-9]/g, '');
}

function inviteCode() {
    const devGroup = config.devGroup || {};
    if (devGroup.code) return devGroup.code;
    const match = String(devGroup.invite || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
    return match ? match[1] : '';
}

/** محاولة معرفة معرّف الجروب من رابط الدعوة */
async function resolveGroupJid(sock) {
    if (state.groupJid) return state.groupJid;

    const code = inviteCode();
    if (!code) return '';

    try {
        const info = await sock.groupGetInviteInfo(code);
        if (info?.id) {
            state.groupJid = info.id;
            return state.groupJid;
        }
    } catch (error) {
        logger.warn(`تعذر قراءة بيانات رابط جروب المطور: ${error.message}`);
    }
    return '';
}

/** هل البوت موجود فعلاً داخل الجروب؟ */
async function checkMembership(sock, groupJid) {
    if (!groupJid) return false;
    const botNumber = pureNumber(sock?.user?.id);
    const botLid = pureNumber(sock?.user?.lid);

    // 1) من قائمة المجموعات المشتركة
    try {
        const groups = await sock.groupFetchAllParticipating();
        if (groups && groups[groupJid]) return true;
    } catch (error) {
        logger.warn(`تعذر جلب قائمة المجموعات: ${error.message}`);
    }

    // 2) من بيانات الجروب مباشرة
    try {
        const metadata = await sock.groupMetadata(groupJid);
        return (metadata?.participants || []).some(participant => {
            const id = pureNumber(participant.id);
            const lid = pureNumber(participant.lid);
            return (botNumber && (id === botNumber || lid === botNumber)) ||
                   (botLid && (id === botLid || lid === botLid));
        });
    } catch {
        return false;
    }
}

/**
 * التحقق الكامل (مع محاولة الانضمام التلقائي).
 * @returns {Promise<boolean>}
 */
async function verify(sock, { silent = false } = {}) {
    const devGroup = config.devGroup || {};
    state.lastCheck = Date.now();

    if (!devGroup.enforce) {
        state.checked = true;
        state.member = true;
        return true;
    }

    let groupJid = await resolveGroupJid(sock);
    let member = await checkMembership(sock, groupJid);

    if (!member && devGroup.autoJoin) {
        const code = inviteCode();
        if (code) {
            if (!silent) logger.info('🔗 رقم البوت ليس في جروب المطور — جاري الانضمام تلقائياً...');
            try {
                const joined = await sock.groupAcceptInvite(code);
                if (joined) {
                    state.groupJid = joined;
                    groupJid = joined;
                    member = true;
                    logger.success('✅ تم انضمام البوت إلى جروب المطور');
                }
            } catch (error) {
                logger.warn(`فشل الانضمام التلقائي لجروب المطور: ${error.message}`);
            }
        }
    }

    if (!member && groupJid) member = await checkMembership(sock, groupJid);

    state.checked = true;
    state.member = Boolean(member);

    if (state.member) {
        if (!silent) logger.success('🛡️ تم تأكيد الشرط: رقم البوت موجود في جروب المطور — التشغيل طبيعي');
    } else {
        logger.error('🚫 رقم البوت غير موجود في جروب المطور — تم إيقاف تنفيذ الأوامر');
        logger.error(`   انضم من هنا: ${devGroup.invite}`);
    }

    return state.member;
}

/** إعادة الفحص دورياً */
function watch(sock) {
    const minutes = Number(config.devGroup?.recheckMinutes) || 15;
    const timer = setInterval(() => {
        verify(sock, { silent: true }).catch(() => {});
    }, minutes * 60 * 1000);
    timer.unref?.();
    return timer;
}

/** هل يُسمح بتنفيذ الأوامر الآن؟ */
function isAllowed() {
    if (!config.devGroup?.enforce) return true;
    if (!state.checked) return true; // لا نعطّل البوت قبل انتهاء الفحص الأول
    return state.member;
}

/** رسالة تنبيه تُرسل مرة واحدة لكل محادثة */
function shouldNotify(chatJid) {
    if (state.notified.has(chatJid)) return false;
    state.notified.add(chatJid);
    return true;
}

module.exports = { verify, watch, isAllowed, shouldNotify, state };
