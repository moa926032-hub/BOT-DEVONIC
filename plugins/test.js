
module.exports = {
    command: 'تست',
    description: 'اختبار البوت',
    usage: '.test',
    category: 'tools',    
    
    async execute(sock, msg) {
        try {
            const decoratedText = `𝐀𝐍𝐀𝐒𝐓𝐀𝐒𝐈𝐀 𝐈𝐒 𝐖𝐎𝐑𝐊𝐈𝐍𝐆 𝐍𝐎𝐖`;
            await sock.sendMessage(msg.key.remoteJid, {
                text: decoratedText,
                mentions: [msg.sender]
            }, { quoted: msg });
        } catch (error) {
            console.error('❌', 'Error executing test:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: responses.error.general(error.message || error.toString())
            }, { quoted: msg });
        }
    }
};