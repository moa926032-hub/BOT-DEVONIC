const { isElite } = require('../haykala/elite.js');
const { jidDecode } = require('@whiskeysockets/baileys');
const fs = require('fs');
const { join } = require('path');
const fetch = require('node-fetch');
const { safeWriteFile } = require('../utils/storage');

const decode = jid => (jidDecode(jid)?.user || jid.split('@')[0]) + '@s.whatsapp.net';

module.exports = {
    command: 'نسخة',
    description: 'نسخ تفاصيل المجموعة مثل الاسم والوصف والصورة.',
    usage: '.نسخة [نسخ|لصق|حذف|حافظة] [اسم النسخة]',
    
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

            const body = msg.message?.extendedTextMessage?.text ||
                         msg.message?.conversation || '';
            const args = body.trim().split(/\s+/);
            const action = args[1]?.toLowerCase();
            const name = args.slice(2).join(' ').trim();

            const baseDir = join('tmp', 'copy-group');

            if (!action) {
                return await sock.sendMessage(groupJid, {
                    text: '❌ يرجى استخدام الأمر بشكل صحيح:\n.نسخة نسخ [اسم]\n.نسخة لصق [اسم]\n.نسخة حذف [اسم]\n.نسخة حافظة'
                }, { quoted: msg });
            }

            if (action === 'نسخ') {
                if (!name) return await sock.sendMessage(groupJid, { text: '❗ اكتب اسم النسخة\nمثال: .نسخة نسخ مجموعة1' }, { quoted: msg });

                const meta = await sock.groupMetadata(groupJid);
                const groupData = {
                    subject: meta.subject,
                    description: meta.desc || '',
                    settings: {
                        announce: !!meta.announce,
                        restrict: !!meta.restrict
                    },
                    created: meta.creation,
                    id: meta.id
                };

                const savePath = join(baseDir, name);
                fs.mkdirSync(savePath, { recursive: true });
                safeWriteFile(join(savePath, 'groupData.json'), JSON.stringify(groupData, null, 2));

                try {
                    const pfp = await sock.profilePictureUrl(groupJid, 'image');
                    const res = await fetch(pfp);
                    const buffer = await res.arrayBuffer();
                    safeWriteFile(join(savePath, `${name}.jpg`), Buffer.from(buffer));
                } catch {
                    console.log('لا توجد صورة للمجموعة.');
                }

                return await sock.sendMessage(groupJid, { text: `✅ تم حفظ النسخة: ${name}` }, { quoted: msg });
            }

            if (action === 'لصق') {
                if (!name) return await sock.sendMessage(groupJid, { text: '❗ اكتب اسم النسخة للصقها.\nمثال: .نسخة لصق مجموعة1' }, { quoted: msg });

                const dataPath = join(baseDir, name, 'groupData.json');
                if (!fs.existsSync(dataPath)) return await sock.sendMessage(groupJid, { text: `❌ النسخة "${name}" غير موجودة.` }, { quoted: msg });

                const data = JSON.parse(fs.readFileSync(dataPath));
                await sock.groupUpdateSubject(groupJid, data.subject);
                await sock.groupUpdateDescription(groupJid, data.description);
                await sock.groupSettingUpdate(groupJid, data.settings.announce ? 'announcement' : 'not_announcement');
                await sock.groupSettingUpdate(groupJid, data.settings.restrict ? 'locked' : 'unlocked');

                const imgPath = join(baseDir, name, `${name}.jpg`);
                if (fs.existsSync(imgPath)) {
                    await sock.updateProfilePicture(groupJid, { url: imgPath });
                }

                return await sock.sendMessage(groupJid, { text: `✅ تم لصق النسخة "${name}" بنجاح.` }, { quoted: msg });
            }

            if (action === 'حذف') {
                if (!name) return await sock.sendMessage(groupJid, { text: '❗ اكتب اسم النسخة لحذفها.\nمثال: .نسخة حذف مجموعة1' }, { quoted: msg });

                const delPath = join(baseDir, name);
                if (!fs.existsSync(delPath)) return await sock.sendMessage(groupJid, { text: `❌ النسخة "${name}" غير موجودة.` }, { quoted: msg });

                fs.rmSync(delPath, { recursive: true, force: true });
                return await sock.sendMessage(groupJid, { text: `✅ تم حذف النسخة: ${name}` }, { quoted: msg });
            }

            if (action === 'حافظة') {
                if (!fs.existsSync(baseDir)) return await sock.sendMessage(groupJid, { text: '❗ لا توجد نسخ محفوظة.' }, { quoted: msg });

                const list = fs.readdirSync(baseDir);
                if (list.length === 0) return await sock.sendMessage(groupJid, { text: '❗ لا توجد نسخ محفوظة.' }, { quoted: msg });

                let reply = '*📁 النسخ المحفوظة:*\n\n';
                list.forEach((n, i) => reply += `${i + 1}. ${n}\n`);
                return await sock.sendMessage(groupJid, { text: reply }, { quoted: msg });
            }

            return await sock.sendMessage(groupJid, {
                text: '❌ أمر غير معروف.\nالاستخدام:\n.نسخة نسخ [اسم]\n.نسخة لصق [اسم]\n.نسخة حذف [اسم]\n.نسخة حافظة'
            }, { quoted: msg });
        } catch (err) {
            console.error('❌ خطأ في أمر النسخة:', err);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ حدث خطأ:\n${err.message || err}`
            }, { quoted: msg });
        }
    }
};