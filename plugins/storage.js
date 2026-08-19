const { formatBytes, getStorageStats } = require('../utils/storage');

module.exports = {
    command: ['تخزين', 'storage'],
    description: 'عرض حجم البيانات المخزنة والمساحة المتبقية',
    usage: '.تخزين',
    category: 'developer',
    owner: true,

    async execute(sock, msg) {
        const stats = getStorageStats();
        await sock.sendMessage(msg.key.remoteJid, {
            text: `📦 حالة تخزين البوت\n\nالحجم المستخدم: ${formatBytes(stats.bytes)}\nالمتاح: ${formatBytes(stats.remainingBytes)}\nالنسبة: ${stats.percentage}%\nعدد الملفات: ${stats.files}\n\nللتنظيف استخدم: .تنظيف`
        }, { quoted: msg });
    }
};