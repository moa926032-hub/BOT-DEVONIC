/**
 * معالج الأوامر — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * إصلاحات مهمة في هذه النسخة:
 *  1) كان المعالج لا يمرّر args للأوامر إطلاقاً، فأي أمر يحتاج وسائط
 *     (التحميل، البحث، هل، زرف...) كان يفشل. الآن يُمرَّر args دائماً.
 *  2) توحيد شكل الرسالة (reply / react / text / quoted / sender) لكل
 *     الإضافات القديمة والجديدة.
 *  3) طبقة توافق أقوى للإضافات المستوردة من بوتات أخرى (sendButton,
 *     sendButtonNormal, sendCarousel, Api...) بدل السقوط بخطأ undefined.
 *  4) تطبيق شرط جروب المطور قبل تنفيذ أي أمر.
 *  5) تمرير الحالات (الاستوريهات) لمراقب المشاهدة والتفاعل التلقائي.
 */

const { loadPlugins } = require('./plugins');
const config = require('../config');
const logger = require('../utils/console');
const fs = require('fs');
const path = require('path');
const { isElite } = require('../haykala/elite');
const { getStorageStats, MAX_STORAGE_BYTES, formatBytes } = require('../utils/storage');
const statusWatcher = require('../utils/status');
const devGroup = require('../utils/devGroup');
const media = require('../utils/media');

const commands = new Map();

global.reply_status = global.reply_status || null;

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

/* ────────────────────── استخراج البيانات ────────────────────── */

function bodyOf(message) {
    return message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        '';
}

function getInteractiveId(message) {
    return message.message?.buttonsResponseMessage?.selectedButtonId ||
        message.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        message.message?.templateButtonReplyMessage?.selectedId ||
        (message.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson &&
            getNativeFlowId(message.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)) ||
        null;
}

function getNativeFlowId(paramsJson) {
    try {
        const params = JSON.parse(paramsJson);
        return params.id || params.selectedId || null;
    } catch {
        return null;
    }
}

/** إضافة اختصارات مفيدة لكائن الرسالة (لا تكسر أي إضافة قديمة) */
function decorateMessage(sock, message, args) {
    const chat = message.key.remoteJid;
    const contextInfo = message.message?.extendedTextMessage?.contextInfo || {};

    message.chat = chat;
    message.isGroup = chat.endsWith('@g.us');
    message.sender = message.key.participant || chat;
    message.mentionedJid = contextInfo.mentionedJid || [];
    message.body = bodyOf(message);
    message.text = (args || []).join(' ');
    message.args = args || [];

    if (contextInfo.quotedMessage) {
        message.quoted = {
            ...contextInfo.quotedMessage,
            key: {
                remoteJid: chat,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant,
                fromMe: false
            },
            sender: contextInfo.participant,
            mimetype: contextInfo.quotedMessage.imageMessage ? 'image/jpeg'
                : contextInfo.quotedMessage.videoMessage ? 'video/mp4'
                : contextInfo.quotedMessage.audioMessage ? 'audio/mpeg' : '',
            text: contextInfo.quotedMessage.conversation ||
                contextInfo.quotedMessage.extendedTextMessage?.text || ''
        };
    } else {
        message.quoted = null;
    }

    message.reply = async (content, options = {}) =>
        sock.sendMessage(chat,
            typeof content === 'string' ? { text: content } : content,
            { quoted: message, ...options }
        );

    message.react = async emoji =>
        sock.sendMessage(chat, { react: { text: emoji, key: message.key } }).catch(() => {});

    message.lid2jid = jid => jid;

    return message;
}

/* ────────────────────── المعالج الرئيسي ────────────────────── */

async function handleMessages(sock, { messages }) {
    let message;
    try {
        message = messages[0];
        if (!message) return;

        /* 1) الحالات / الاستوريهات: مشاهدة + تفاعل بقلب */
        if (statusWatcher.isStatus(message)) {
            await statusWatcher.handleStatus(sock, message).catch(() => {});
            return;
        }

        const interactiveId = getInteractiveId(message);
        const body = bodyOf(message) || interactiveId || '';
        if (!body) return;

        const currentPrefix = config.prefix;
        const hasPrefix = currentPrefix === ''
            ? true
            : body.toLowerCase().startsWith(currentPrefix.toLowerCase());
        if (!interactiveId && !hasPrefix) return;

        const menuAction = interactiveId?.startsWith('menu:') ? interactiveId : null;

        // الأزرار التي تحمل أمراً كاملاً (مثل ".اغنيه <رابط>") تُنفَّذ كأمر عادي
        const source = interactiveId && !menuAction && interactiveId.startsWith(currentPrefix || '.')
            ? interactiveId
            : body;

        const parts = menuAction
            ? [`menu`]
            : source.slice(currentPrefix.length).trim().split(/\s+/);

        const command = parts[0]?.toLowerCase();
        const args = menuAction ? [] : parts.slice(1);
        if (!command) return;

        const commandWithoutPrefix = command.replace(currentPrefix, '');
        logger.info(`تم استلام أمر: ${commandWithoutPrefix} من: ${message.key.remoteJid}`);

        /* 2) حالة تشغيل البوت */
        const botPath = path.join(__dirname, '../data/bot.txt');
        let botStatus = '[on]';
        try {
            if (fs.existsSync(botPath)) botStatus = fs.readFileSync(botPath, 'utf8').trim();
        } catch (err) {
            logger.warn('تعذر قراءة ملف bot.txt:', err.message);
        }

        if (botStatus === '[off]' && commandWithoutPrefix !== 'bot') {
            logger.warn(`البوت موقوف. تجاهل الأمر: ${commandWithoutPrefix}`);
            return;
        }

        /* 3) شرط جروب المطور */
        if (!devGroup.isAllowed()) {
            logger.warn('تم رفض الأمر: رقم البوت ليس في جروب المطور');
            if (devGroup.shouldNotify(message.key.remoteJid)) {
                await sock.sendMessage(message.key.remoteJid, {
                    text: config.devGroup.blockMessage
                }, { quoted: message }).catch(() => {});
            }
            return;
        }

        /* 4) المرسل ووضع النخبة */
        let senderNumber;
        if (message.key.remoteJid.endsWith('@g.us')) {
            senderNumber = message.key.participant?.split('@')[0] || '';
        } else {
            senderNumber = message.key.remoteJid.split('@')[0];
        }

        const modePath = path.join(__dirname, '../data/mode.txt');
        let eliteMode = false;
        try {
            if (fs.existsSync(modePath)) {
                eliteMode = fs.readFileSync(modePath, 'utf8').trim() === '[on]';
            }
        } catch (err) {
            logger.warn('تعذر قراءة ملف mode.txt:', err.message);
        }

        if (eliteMode && !isElite(senderNumber)) {
            logger.warn(`تجاهل من غير النخبة: ${senderNumber}`);
            return;
        }

        /* 5) إيجاد الإضافة */
        const plugins = await loadPlugins();
        const handler = plugins[commandWithoutPrefix];
        if (!handler) {
            logger.warn(`أمر غير معروف: ${commandWithoutPrefix}`);
            return;
        }

        message.command = commandWithoutPrefix;
        message.prefix = currentPrefix;
        message.interactiveId = menuAction;
        decorateMessage(sock, message, args);

        global.reply_status = message;

        /* 6) الصلاحيات */
        if ((handler.elite || handler.owner) && !isOwner(senderNumber)) {
            logger.warn(`محاولة أمر نخبة من غير مصرح: ${senderNumber}`);
            await sock.sendMessage(message.key.remoteJid, {
                text: config.messages.ownerOnly
            }, { quoted: message });
            return;
        }

        if (handler.group && !message.isGroup) {
            await sock.sendMessage(message.key.remoteJid, {
                text: config.messages.groupOnly
            }, { quoted: message });
            return;
        }

        if (handler.admin || handler.botAdmin) {
            if (!message.isGroup) {
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

        /* 7) التنفيذ */
        if (handler.foreign) {
            await executeForeignPlugin(sock, message, handler);
        } else if (typeof handler.execute === 'function') {
            await handler.execute(sock, message, args);
        } else if (typeof handler === 'function') {
            await handler(sock, message, args);
        } else {
            throw new Error('المعالج غير صالح: لا توجد دالة execute');
        }

        logger.success(`تم تنفيذ الأمر: ${commandWithoutPrefix}`);

        const stats = getStorageStats();
        if (stats.bytes > MAX_STORAGE_BYTES) {
            logger.warn(`تجاوز التخزين الحد المسموح: ${formatBytes(stats.bytes)}`);
        }
    } catch (error) {
        logger.error(`✗ خطأ في معالجة الرسالة: ${error.stack || error}`);
        if (message?.key?.remoteJid) {
            await sock.sendMessage(message.key.remoteJid, {
                text: `${config.messages.error}\n\n\`\`\`${String(error.message || error).slice(0, 300)}\`\`\``
            }).catch(() => {});
        }
    }
}

function isOwner(senderNumber) {
    const owners = Array.isArray(config.owners) ? config.owners : [];
    const normalized = String(senderNumber || '').replace(/[@:].*/g, '');
    const configuredOwners = owners.map(owner =>
        typeof owner === 'string' ? owner : owner?.jid || owner?.lid || owner?.phoneNumber || ''
    );
    return configuredOwners.some(owner => String(owner).replace(/[@:].*/g, '') === normalized) ||
        String(config.owner || '').replace(/[@:].*/g, '') === normalized ||
        isElite(senderNumber);
}

async function handleCommand(sock, msg, command, args) {
    const entry = commands.get(command.toLowerCase());
    if (!entry) return;

    try {
        if (entry.owner && !isOwner(msg.sender)) return msg.reply(config.messages.ownerOnly);
        if (entry.group && !msg.isGroup) return msg.reply(config.messages.groupOnly);
        if (msg.isGroup && config.allowedGroups.length > 0 && !config.allowedGroups.includes(msg.chat)) {
            return msg.reply(config.messages.notAllowedGroup);
        }
        await entry.exec(sock, msg, args);
    } catch (error) {
        logger.error(`✗ خطأ في تنفيذ الأمر ${command}:`, error);
        msg.reply(config.messages.error);
    }
}

/* ────────────────── طبقة توافق الإضافات المستوردة ────────────────── */

function mediaContent(content = {}) {
    const target = content.media?.url || content.media || content.imageUrl || content.videoUrl;
    if (!target) return null;

    const type = content.mediaType ||
        (content.videoUrl ? 'video' : content.imageUrl ? 'image' : 'image');
    const source = typeof target === 'string' ? { url: target } : target;

    if (type === 'video') return { video: source };
    if (type === 'audio') return { audio: source, mimetype: 'audio/mpeg' };
    if (type === 'document') return { document: source };
    return { image: source };
}

function buttonsToText(buttons = []) {
    const lines = [];
    for (const button of buttons) {
        const params = button?.params || {};
        if (button?.buttonText?.displayText) {
            lines.push(`• ${button.buttonText.displayText}`);
            continue;
        }
        if (params.display_text && params.id) lines.push(`• ${params.display_text} → ${params.id}`);
        else if (params.display_text && params.url) lines.push(`• ${params.display_text}: ${params.url}`);
        else if (params.display_text && params.copy_code) lines.push(`• ${params.display_text}: ${params.copy_code}`);
        else if (params.display_text) lines.push(`• ${params.display_text}`);
        else if (params.sections) {
            for (const section of params.sections) {
                for (const row of section.rows || []) {
                    lines.push(`• ${row.title}${row.id ? ` → ${row.id}` : ''}`);
                }
            }
        }
    }
    return lines.length ? `\n\n${lines.join('\n')}` : '';
}

function buildCompatSocket(sock) {
    const quotedOf = options => (options && options.key ? { quoted: options } : {});

    return Object.assign(sock, {
        /** أزرار → نص + وسائط (واتساب لم يعد يوصّل الأزرار للبوتات) */
        sendButton: async (chat, content = {}, options) => {
            const text = `${content.bodyText || content.text || content.caption || ''}` +
                (content.footerText ? `\n\n${content.footerText}` : '') +
                buttonsToText(content.buttons);
            const asMedia = mediaContent(content);
            const payload = asMedia ? { ...asMedia, caption: text } : { text };
            return sock.sendMessage(chat, payload, quotedOf(options));
        },

        sendButtonNormal: async (chat, content = {}, options) => {
            const text = `${content.caption || content.bodyText || content.text || ''}` +
                (content.footerText ? `\n\n${content.footerText}` : '') +
                buttonsToText(content.buttons);
            const asMedia = mediaContent(content);
            const payload = asMedia ? { ...asMedia, caption: text } : { text };
            return sock.sendMessage(chat, payload, quotedOf(options));
        },

        sendCarousel: async (chat, content = {}, options) => {
            const cards = content.cards || [];
            if (content.headerText) {
                await sock.sendMessage(chat, { text: content.headerText }, quotedOf(options)).catch(() => {});
            }
            for (const card of cards) {
                const text = `${card.bodyText || ''}` +
                    (card.footerText ? `\n\n${card.footerText}` : '') +
                    buttonsToText(card.buttons);
                const asMedia = mediaContent(card);
                await sock.sendMessage(chat,
                    asMedia ? { ...asMedia, caption: text } : { text }
                ).catch(() => {});
            }
            return true;
        },

        msgUrl: async (chat, text, options) => sock.sendMessage(chat, { text }, quotedOf(options)),

        sendText: async (chat, text, options) => sock.sendMessage(chat, { text }, quotedOf(options))
    });
}

/** واجهة Api مبسطة للإضافات القديمة التي تنتظرها */
const compatApi = {
    download: {
        instagram: async ({ url }) => {
            const result = await media.download(url, 'video');
            return {
                status: 'success',
                data: [
                    { type: 'thumbnail', url: result.info.thumbnail },
                    { type: 'video', url: result.file }
                ],
                _files: result.all
            };
        },
        youtube: async ({ url, type }) => media.download(url, type === 'audio' ? 'audio' : 'video'),
        tiktok: async ({ url }) => media.tiktokDownload(url),
        mediafire: async ({ url }) => media.mediafire(url)
    },
    search: {
        youtube: async ({ q }) => ({ status: true, data: await media.searchYouTube(q) }),
        tiktok: async ({ q }) => ({ status: true, data: await media.searchTikTok(q) }),
        pinterestImages: async ({ q }) => ({ status: true, data: await media.searchImages(q) })
    }
};

function buildForeignMessage(sock, message) {
    return message; // الرسالة مُزوّدة مسبقاً بكل الاختصارات في decorateMessage
}

async function executeForeignPlugin(sock, message, plugin) {
    const foreignMessage = buildForeignMessage(sock, message);
    const conn = buildCompatSocket(sock);

    const ownerObjects = (Array.isArray(config.owners) ? config.owners : []).map(number => ({
        jid: `${String(typeof number === 'string' ? number : number?.jid || number?.phoneNumber || '').replace(/[^0-9]/g, '')}@s.whatsapp.net`,
        lid: `${String(typeof number === 'string' ? number : number?.lid || number?.phoneNumber || '').replace(/[^0-9]/g, '')}@lid`
    }));

    const bot = {
        Api: compatApi,
        config: {
            commandsPath: path.join(__dirname, '../plugins'),
            owners: ownerObjects,
            info: {
                nameBot: config.botName,
                images: { random: () => '' }
            }
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
                ownerObjects.push({ jid: `${normalized}@s.whatsapp.net`, lid: `${normalized}@lid` });
            }
            return true;
        },
        restart: () => process.send?.('reset'),
        stop: () => process.exit(0)
    };

    await plugin.execute(foreignMessage, {
        conn,
        sock,
        Api: compatApi,
        text: foreignMessage.text,
        args: foreignMessage.args,
        command: foreignMessage.command,
        usedPrefix: config.prefix,
        prefix: config.prefix,
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
    logger.info('تم تهيئة نظام الرسائل بنجاح.');
}

module.exports = {
    handleMessages,
    handleCommand,
    cmd,
    commands,
    createPluginHandler,
    handleMessagesLoader,
    compatApi
};
