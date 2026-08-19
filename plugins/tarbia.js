const fs = require('fs');
const path = require('path');
const { isElite } = require('../haykala/elite.js');
const { jidDecode } = require('@whiskeysockets/baileys');
const { safeWriteFile } = require('../utils/storage');

const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';

const warnings = {};
const activeGroups = new Set();

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'bannedWords.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(filePath)) safeWriteFile(filePath, JSON.stringify([]), 'utf8');

module.exports = {
  command: 'ربيهم',
  description: 'يقوم بحذف الرسائل التي تحتوي على كلمات محظورة (بإذن النخبة).',

  async execute(sock, msg) {
    try {
      const groupJid = msg.key.remoteJid;
      const sender = decode(msg.key.participant || groupJid);
      const senderLid = sender.split('@')[0];

      if (!groupJid.endsWith('@g.us')) {
        return await sock.sendMessage(groupJid, {
          text: '❗ هذا الأمر يعمل فقط داخل المجموعات.'
        }, { quoted: msg });
      }

      if (!isElite(senderLid)) {
        return await sock.sendMessage(groupJid, {
          text: '❌ ليس لديك صلاحية لاستخدام هذا الأمر.'
        }, { quoted: msg });
      }

      if (activeGroups.has(groupJid)) {
        return await sock.sendMessage(groupJid, {
          text: "✅ المراقبة مفعّلة بالفعل في هذه المجموعة."
        }, { quoted: msg });
      }

      activeGroups.add(groupJid);
      await sock.sendMessage(groupJid, { text: '👁️‍🗨️ اناستازيا ستربيهم.' });

      sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;

          const currentChat = msg.key.remoteJid;
          const sender = msg.key.participant || currentChat;

          if (!activeGroups.has(currentChat)) continue;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

          const bannedWords = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (bannedWords.some(word => text.includes(word))) {
            try {
              await sock.sendMessage(currentChat, {
                delete: {
                  remoteJid: currentChat,
                  fromMe: false,
                  id: msg.key.id,
                  participant: sender
                }
              });

              warnings[sender] = (warnings[sender] || 0) + 1;

              if (warnings[sender] < 3) {
                await sock.sendMessage(currentChat, {
                  text: `⚠️ تحذير ${warnings[sender]}/3 🚨`
                });
              } else {
                await sock.groupParticipantsUpdate(currentChat, [sender], 'remove');
                await sock.sendMessage(currentChat, {
                  text: '🗑️ تم التخلص من نفايات المجموعة بنجاح!.'
                });
                delete warnings[sender];
              }
            } catch (err) {
              console.error("خطأ أثناء الحذف أو الطرد:", err);
            }
          }
        }
      });

    } catch (error) {
      console.error('✗ خطأ في أمر ربيهم:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `❌ حدث خطأ أثناء تنفيذ الأمر:\n\n${error.message || error.toString()}`
      }, { quoted: msg });
    }
  }
};