/**
 * 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚ — الإعدادات المركزية
 *
 * ملاحظة مهمة: البريفكس أصبح يُخزَّن في data/prefix.txt ولم يعد يُكتب فوق هذا
 * الملف، حتى لا تُفقد بقية الإعدادات عند تغييره بأمر .بريفكس
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PREFIX_FILE = path.join(DATA_DIR, 'prefix.txt');
const DEFAULT_PREFIX = '.';

function readStoredPrefix() {
    try {
        if (!fs.existsSync(PREFIX_FILE)) return DEFAULT_PREFIX;
        const raw = fs.readFileSync(PREFIX_FILE, 'utf8');
        const value = raw.replace(/[\r\n]/g, '');
        if (value === '{empty}') return '';
        return value.trim() || DEFAULT_PREFIX;
    } catch {
        return DEFAULT_PREFIX;
    }
}

function writeStoredPrefix(value) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(PREFIX_FILE, value === '' ? '{empty}' : value);
        return true;
    } catch {
        return false;
    }
}

let prefix = readStoredPrefix();

const BOT_NAME = '𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚';

module.exports = {
    /* ───────────── الهوية والحقوق ───────────── */
    botName: BOT_NAME,
    brandName: BOT_NAME,
    teamName: '𝐓𝐄𝐀𝐌 𝐃𝐄𝐕𝐎𝐍𝐈𝐂',
    credits: BOT_NAME,
    footer: `© ${BOT_NAME}`,
    version: '4.0.0',

    owner: '972532731932',
    owners: ['972532731932'],

    /* ───────────── قناة الواتساب (التشانل) ─────────────
     * كل رسالة يرسلها البوت تظهر كأنها معاد توجيهها من هذه القناة.
     */
    channel: {
        enabled: true,
        jid: '0029VbC75tvHltY0oNSC4m3z@newsletter',
        name: BOT_NAME,
        link: 'https://whatsapp.com/channel/0029VbC75tvHltY0oNSC4m3z',
        forwardingScore: 999,
        serverMessageId: 200
    },

    /* ───────────── شرط جروب المطور ─────────────
     * البوت لا يعمل إلا إذا كان رقمه عضواً في جروب المطور.
     */
    devGroup: {
        enforce: true,
        autoJoin: true,
        invite: 'https://chat.whatsapp.com/LXJShVjFa0aIDbr2cn1DRd',
        code: 'LXJShVjFa0aIDbr2cn1DRd',
        jid: '',
        recheckMinutes: 15,
        blockMessage:
            `🚫 *${BOT_NAME}*\n\n` +
            'لتشغيل البوت يجب أن يكون رقمه منضماً لجروب المطور:\n' +
            'https://chat.whatsapp.com/LXJShVjFa0aIDbr2cn1DRd\n\n' +
            'انضم بالرقم ثم أعد تشغيل البوت.'
    },

    /* ───────────── الحالات / الاستوريهات ───────────── */
    status: {
        autoView: true,          // مشاهدة كل استوري فوراً (أول مشاهد)
        autoReact: true,         // تفاعل تلقائي
        emoji: '❤️',
        skipOwnStatus: true,
        delayMs: 0               // بدون تأخير = أول المشاهدين
    },

    /* ───────────── التحميل والوسائط ───────────── */
    media: {
        maxFileSizeMb: 90,       // حد الإرسال في واتساب
        ytdlpAutoInstall: true,  // تنزيل yt-dlp تلقائياً إذا لم يكن مثبتاً
        searchResults: 8,
        requestTimeoutMs: 120000,
        tempDirName: 'temp'
    },

    defaultPrefix: DEFAULT_PREFIX,
    get prefix() {
        return prefix;
    },
    set prefix(newPrefix) {
        if (typeof newPrefix !== 'string') return;
        prefix = newPrefix;
        writeStoredPrefix(newPrefix);
    },

    allowedGroups: [],

    messages: {
        error: '❌ حدث خطأ أثناء تنفيذ الأمر',
        noPermission: 'ليس لديك صلاحية لاستخدام هذا الأمر',
        groupOnly: 'هذا الأمر متاح فقط في المجموعات',
        ownerOnly: 'هذا الأمر متاح فقط للنخبة',
        notAllowedGroup: 'عذراً، البوت لا يعمل في هذه المجموعة'
    },

    colors: {
        success: '\x1b[32m',
        error: '\x1b[31m',
        info: '\x1b[36m',
        warn: '\x1b[33m',
        reset: '\x1b[0m'
    }
};
