const config = require('../config');

/*
 * أرقام المطورين. استبدل الأرقام الستة بالأرقام المطلوبة دون تغيير
 * ترتيبها؛ الأمر .المطور يرسل جهة الاتصال الخاصة بالرقم الأول.
 */
const developerNumbers = [
    config.owner,
    '000000000000',
    '000000000001',
    '000000000002',
    '000000000003',
    '000000000004'
];

function pure(number) {
    return String(number || '').replace(/[^0-9]/g, '');
}

module.exports = {
    command: 'المطور',
    category: 'owner',
    description: 'إرسال جهة اتصال المطور الرئيسي',
    usage: '.المطور',
    hidden: false,
    owner: false,
    async execute(sock, msg) {
        const number = pure(developerNumbers[0]);
        if (!number) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: '❌ لم يتم ضبط رقم المطور الرئيسي.'
            }, { quoted: msg });
        }

        await sock.sendMessage(msg.key.remoteJid, {
            contacts: {
                displayName: 'محمد فرعون',
                contacts: [{
                    vcard: [
                        'BEGIN:VCARD',
                        'VERSION:3.0',
                        'FN:محمد فرعون',
                        `TEL;type=CELL;type=VOICE;waid=${number}:+${number}`,
                        'END:VCARD'
                    ].join('\n')
                }]
            }
        }, { quoted: msg });
    }
};

module.exports.developerNumbers = developerNumbers;