const { loadPlugins } = require('./plugins');
const config = require('../config');
const logger = require('../utils/console');
const fs = require('fs-extra');
const path = require('path');
const { isElite } = require('../haykala/elite');
const { getStorageStats, MAX_STORAGE_BYTES, formatBytes } = require('../utils/storage');

const commands = new Map();

function cmd(options = {}) {
    if (!options.name || !options.exec) {
        throw new Error('يجب تحديد اسم الأمر ودالة التنفيذ');
    }

    commands.set(options.name.toLowerCase(), {
        name: options.name,
        exec: options.exec,
        description: options.description || '',
        usage: options.usage || '',
        category: options.category || 'عام',
        cooldown: options.cooldown || 0,
        owner: options.owner || false,
        group: options.group || false,
    });

    logger.info(`تم تسجيل الأمر: ${options.name}`);
}

async function handleMessages(sock, { messages }) {
    let message;
    try {
        message = messages[0];
        if (!message) return;

        const interactiveId = getInteractiveId(message);
        const body = message.message?.conversation ||
                     message.message?.extendedTextMessage?.text ||
                     message.message?.imageMessage?.caption ||
                     message.message?.videoMessage?.caption ||
                     interactiveId || '';

        if (!body) return;

        const currentPrefix = config.prefix;
        if (!interactiveId && !body.toLowerCase().startsWith(currentPrefix.toLowerCase())) return;

        const menuAction = interactiveId?.startsWith('menu:') ? interactiveId : null;
        const parts = menuAction
            ? [currentPrefix + 'menu']
            : body.slice(currentPrefix.length).trim().split(/\s+/);
        const command = parts[0]?.toLowerCase();
        const args = menuAction ? [] : parts.slice(1);
        if (!command) return;

        const commandWithoutPrefix = command.replace(currentPrefix, '');
        logger.info(`تم استلام أمر: ${commandWithoutPrefix} من: ${message.key.remoteJid}`);

        const botPath = path.join(__dirname, '../data/bot.txt');
        let botStatus = '[on]';
        try {
            if (fs.existsSync(botPath)) {
                botStatus = fs.readFileSync(botPath, 'utf8').trim();
            }
        } catch (err) {
            logger.warn('تعذر قراءة ملف bot.txt:', err.message);
        }

      
        if (botStatus === '[off]' && commandWithoutPrefix !== 'bot') {
            logger.warn(`البوت موقوف. تجاهل الأمر: ${commandWithoutPrefix}`);
            return;
        }

        
        let senderNumber;
        if (message.key.remoteJid.endsWith('@g.us')) {
            senderNumber = message.key.participant?.split('@')[0] || '';
        } else {
            senderNumber = message.key.remoteJid.split('@')[0];
        }

        // التحقق من وضع النخبة
        const modePath = path.join(__dirname, '../data/mode.txt');
        let eliteMode = false;
        try {
            if (fs.existsSync(modePath)) {
                const modeValue = fs.readFileSync(modePath, 'utf8').trim();
                eliteMode = modeValue === '[on]';
            }
        } catch (err) {
            logger.warn('تعذر قراءة ملف mode.txt:', err.message);
        }

        if (eliteMode && !isElite(senderNumber)) {
            logger.warn(`تجاهل من غير النخبة: ${senderNumber}`);
            return;
        }

        const plugins = await loadPlugins();
        const handler = plugins[commandWithoutPrefix];
        if (!handler) {
            logger.warn(`أمر غير معروف: ${commandWithoutPrefix}`);
            return;
        }

        message.args = args;
        message.command = command;
        message.prefix = currentPrefix;
        message.interactiveId = menuAction;

        if ((handler.elite || handler.owner) && !isOwner(senderNumber)) {
            logger.warn(`محاولة أمر نخبة من غير مصرح: ${senderNumber}`);
            await sock.sendMessage(message.key.remoteJid, {
                text: config.messages.ownerOnly
            }, { quoted: message });
            return;
        }

        if (handler.group && !message.key.remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(message.key.remoteJid, {
                text: config.messages.groupOnly
            });
            return;
        }

        if (handler.admin || handler.botAdmin) {
            if (!message.key.remoteJid.endsWith('@g.us')) {
                await sock.sendMessage(message.key.remoteJid, { text: config.messages.groupOnly }, { quoted: message });
                return;
            }

            const metadata = await sock.groupMetadata(message.key.remoteJid);
            const participant = metadata.participants.find(item =>
                item.id === (message.key.participant || message.key.remoteJid)
            );
            const botNumber = String(sock.user?.id || '').split(':')[0].replace(/[^0-9]/g, '');
            const botParticipant = metadata.participants.find(item =>
                String(item.id || '').split('@')[0].replace(/[^0-9]/g, '') === botNumber
            );

            if (handler.admin && !participant?.admin) {
                await sock.sendMessage(message.key.remoteJid, {
                    text: '❌ هذا الأمر متاح للمشرفين فقط.'
                }, { quoted: message });
                return;
            }

            if (handler.botAdmin && !botParticipant?.admin) {
                await sock.sendMessage(message.key.remoteJid, {
                    text: '❌ يجب أن يكون البوت مشرفًا لتنفيذ هذا الأمر.'
                }, { quoted: message });
                return;
            }
        }

        if (handler.foreign) {
            await executeForeignPlugin(sock, message, handler);
        } else if (typeof handler === 'function') {
            await handler(sock, message);
        } else if (typeof handler.execute === 'function') {
            await handler.execute(sock, message);
        } else {
            throw new Error('المعالج غير صالح: لا توجد دالة execute');
        }

        logger.success(`تم تنفيذ الأمر: ${command}`);

        const stats = getStorageStats();
        if (stats.bytes > MAX_STORAGE_BYTES) {
            logger.warn(`تجاوز التخزين الحد المسموح: ${formatBytes(stats.bytes)}`);
        }
    } catch (error) {
        logger.error(`✗ خطأ في معالجة الرسالة: ${error.stack}`);
        if (message?.key?.remoteJid) {
            await sock.sendMessage(message.key.remoteJid, {
                text: config.messages.error
            }).catch(() => {});
        }
    }
}

function getInteractiveId(message) {
    return message.message?.buttonsResponseMessage?.selectedButtonId ||
        message.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        message.message?.templateButtonReplyMessage?.selectedId ||
        message.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson &&
            getNativeFlowId(message.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
}

function getNativeFlowId(paramsJson) {
    try {
        const params = JSON.parse(paramsJson);
        return params.id || params.selectedId || null;
    } catch {
        return null;
    }
}

function isOwner(senderNumber) {
    const owners = Array.isArray(config.owners) ? config.owners : [];
    const normalized = String(senderNumber || '').replace(/[@:].*/g, '');
    const configuredOwners = owners.map(owner =>
        typeof owner === 'string'
            ? owner
            : owner?.jid || owner?.lid || owner?.phoneNumber || ''
    );
    return configuredOwners.some(owner =>
        String(owner).replace(/[@:].*/g, '') === normalized
    ) ||
        String(config.owner || '').replace(/[@:].*/g, '') === normalized ||
        isElite(senderNumber);
}

async function handleCommand(sock, msg, command, args) {
    const cmd = commands.get(command.toLowerCase());
    if (!cmd) return;

    try {
        if (cmd.owner && !isOwner(msg.sender)) {
            return msg.reply(config.messages.ownerOnly);
        }

        if (cmd.group && !msg.isGroup) {
            return msg.reply(config.messages.groupOnly);
        }

        if (msg.isGroup && config.allowedGroups.length > 0 && !config.allowedGroups.includes(msg.chat)) {
            return msg.reply(config.messages.notAllowedGroup);
        }

        await cmd.exec(sock, msg, args);
    } catch (error) {
        logger.error(`✗ خطأ في تنفيذ الأمر ${command}:`, error);
        msg.reply(config.messages.error);
    }
}

function buildForeignMessage(sock, message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedMessage = quoted ? {
        ...quoted,
        key: message.message.extendedTextMessage.contextInfo.stanzaId
            ? { id: message.message.extendedTextMessage.contextInfo.stanzaId, remoteJid: message.key.remoteJid }
            : message.key,
        sender: message.message.extendedTextMessage.contextInfo.participant,
        mimetype: quoted.imageMessage ? 'image/jpeg' : quoted.videoMessage ? 'video/mp4' : '',
        download: async () => {
            throw new Error('تنزيل الرسالة المقتبس منها غير مدعوم بهذا الأمر حاليًا');
        }
    } : null;

    const foreign = {
        ...message,
        chat: message.key.remoteJid,
        sender: message.key.participant || message.key.remoteJid,
        isGroup: message.key.remoteJid.endsWith('@g.us'),
        quoted: quotedMessage,
        mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
        text: message.args.join(' '),
        command: message.command.replace(message.prefix, '').toLowerCase(),
        reply: async text => sock.sendMessage(message.key.remoteJid, { text }, { quoted: message }),
        react: async emoji => sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        }),
        lid2jid: jid => jid,
    };

    return foreign;
}

async function executeForeignPlugin(sock, message, plugin) {
    const foreignMessage = buildForeignMessage(sock, message);
    const conn = Object.assign(sock, {
        sendButton: async (chat, content, options) =>
            sock.sendMessage(chat, { text: content.text || content.caption || '' }, options),
        sendButtonNormal: async (chat, content, options) =>
            sock.sendMessage(chat, { text: content.text || content.caption || '' }, options),
        msgUrl: async (chat, text, options) =>
            sock.sendMessage(chat, { text }, options),
    });
    const ownerObjects = (Array.isArray(config.owners) ? config.owners : []).map(number => ({
        jid: `${String(typeof number === 'string' ? number : number?.jid || number?.phoneNumber || '').replace(/[^0-9]/g, '')}@s.whatsapp.net`,
        lid: `${String(typeof number === 'string' ? number : number?.lid || number?.phoneNumber || '').replace(/[^0-9]/g, '')}@lid`
    }));
    const bot = {
        config: {
            commandsPath: path.join(__dirname, '../plugins'),
            owners: ownerObjects,
            info: { nameBot: config.botName, images: { random: () => '' } }
        },
        addOwner: number => {
            const normalized = String(number || '').replace(/[^0-9]/g, '');
            if (!normalized) return false;
            const exists = config.owners.some(owner =>
                String(typeof owner === 'string' ? owner : owner?.phoneNumber || owner?.jid || '')
                    .replace(/[^0-9]/g, '') === normalized
            );
            if (!exists) {
                config.owners.push(normalized);
                ownerObjects.push({
                    jid: `${normalized}@s.whatsapp.net`,
                    lid: `${normalized}@lid`
                });
            }
            return true;
        },
        restart: () => process.send?.('reset'),
        stop: () => process.exit(0)
    };
    await plugin.execute(foreignMessage, {
        conn,
        text: foreignMessage.text,
        command: foreignMessage.command,
        bot
    });
}

function createPluginHandler(options = {}) {
    const pluginHandler = options.execute || (() => {});
    pluginHandler.elite = options.elite || false;
    pluginHandler.group = options.group || false;
    pluginHandler.desc = options.desc || 'لا يوجد وصف';
    pluginHandler.command = options.command || 'لا يوجد أمر محدد';
    pluginHandler.usage = options.usage || 'لا توجد معلومات استخدام';
    return pluginHandler;
}

function handleMessagesLoader() {
    logger.info("تم تهيئة نظام الرسائل بنجاح.");
}

module.exports = {
    handleMessages,
    handleCommand,
    cmd,
    commands,
    createPluginHandler,
    handleMessagesLoader
};