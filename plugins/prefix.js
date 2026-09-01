/**
 * تغيير البريفكس — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * كان هذا الأمر يعيد كتابة ملف config.js بالكامل، فيمسح كل الإعدادات
 * (اسم البوت، القناة، جروب المطور، إعدادات الاستوري...) عند تغيير البريفكس.
 * الآن البريفكس يُحفظ في data/prefix.txt عبر config.prefix فقط.
 */

const config = require('../config.js');
const { isElite } = require('../haykala/elite.js');

module.exports = {
    command: ['بريفكس', 'prefix'],
    description: 'تغيير البريفكس الخاص بالأوامر (النخبة فقط)',
    usage: '.بريفكس $',
    category: 'tools',

    async execute(sock, msg, args = []) {
        const chatId = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const sender = senderJid.split('@')[0];

        if (typeof isElite !== 'function' || !isElite(sender)) {
            return sock.sendMessage(chatId, { text: config.messages.ownerOnly }, { quoted: msg });
        }

        const fullText = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text || '';
        const currentPrefix = config.prefix || config.defaultPrefix || '.';

        let input = (Array.isArray(args) ? args.join(' ') : '').trim();
        if (!input && fullText.startsWith(currentPrefix)) {
            input = fullText.slice(currentPrefix.length).trim().split(/\s+/).slice(1).join(' ').trim();
        }

        if (!input) {
            return sock.sendMessage(chatId, {
                text: `❌ الرجاء كتابة البريفكس الجديد.\n\n` +
                    `مثال:\n${currentPrefix}بريفكس $\n${currentPrefix}بريفكس فارغ\n\n` +
                    `البريفكس الحالي: ${currentPrefix === '' ? 'فارغ' : currentPrefix}`
            }, { quoted: msg });
        }

        const newPrefix = (input === 'فارغ' || input === 'empty') ? '' : input;

        if (newPrefix.length > 3) {
            return sock.sendMessage(chatId, {
                text: '❌ البريفكس طويل جداً، استخدم 3 رموز كحد أقصى.'
            }, { quoted: msg });
        }

        config.prefix = newPrefix;

        const display = newPrefix === '' ? 'فارغ' : `( ${newPrefix} )`;
        return sock.sendMessage(chatId, {
            text: `✅ تم تغيير البريفكس إلى ${display}\n\n> ${config.botName}`
        }, { quoted: msg });
    }
};
