/**
 * قائمة الأوامر — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * سبب التعطّل سابقاً: كانت القائمة تُرسل كرسالة "list message" (sections)،
 * وواتساب لم يعد يوصّل هذا النوع لحسابات البوتات العادية، فكانت الرسالة
 * تُرفض ولا يظهر شيء. الحل: قائمة نصية مؤكّدة الوصول مع صورة ترويسة،
 * وأقسام يمكن فتحها بـ  .اوامر <اسم القسم>
 */

const fs = require('fs');
const path = require('path');
const { getPlugins } = require('../handlers/plugins.js');
const config = require('../config');

const HEADER_IMAGE = path.join(__dirname, '..', 'image.jpeg');

const CATEGORY_ICONS = {
    'الوسائط': '🎬',
    'المجموعات': '👥',
    'الإدارة': '🛡️',
    'الأدوات': '🧰',
    'الترفيه': '🎮',
    'المطور': '👑',
    'البحث': '🔎',
    'search': '🔎',
    'عام': '✨'
};

module.exports = {
    name: 'Bot Commands',
    command: ['menu', 'اوامر', 'أوامر', 'قائمة', 'help', 'الاوامر'],
    category: 'tools',
    description: 'عرض قائمة أوامر البوت',
    usage: '.اوامر  |  .اوامر الوسائط',
    hidden: true,
    version: '5.0',

    async execute(sock, msg, args = []) {
        const chatId = msg.key.remoteJid;

        try {
            const plugins = uniquePlugins(getPlugins());
            const categories = groupByCategory(plugins);
            const prefix = config.prefix;
            const requested = (args.join(' ') || '').trim();

            const caption = requested
                ? buildCategoryView(categories, requested, prefix, plugins)
                : buildRootView(categories, prefix, plugins.length);

            await sendMenu(sock, msg, chatId, caption);
        } catch (error) {
            console.error('❌ Menu Error:', error);
            await sock.sendMessage(chatId, {
                text: '❌ حدث خطأ أثناء إنشاء القائمة.'
            }, { quoted: msg }).catch(() => {});
        }
    }
};

/* ────────────────── الإرسال ────────────────── */

async function sendMenu(sock, msg, chatId, caption) {
    const contextInfo = {
        externalAdReply: {
            title: config.botName,
            body: config.channel?.name || config.teamName,
            thumbnailUrl: '',
            sourceUrl: config.channel?.link || '',
            mediaType: 1,
            renderLargerThumbnail: false
        }
    };

    // نحاول إرسالها كصورة مع الشرح، وإن تعذر نرسل نصاً عادياً
    if (fs.existsSync(HEADER_IMAGE)) {
        try {
            return await sock.sendMessage(chatId, {
                image: fs.readFileSync(HEADER_IMAGE),
                caption,
                contextInfo
            }, { quoted: msg });
        } catch (error) {
            console.warn('تعذر إرسال صورة القائمة، سيتم الإرسال كنص:', error.message);
        }
    }

    return sock.sendMessage(chatId, { text: caption, contextInfo }, { quoted: msg });
}

/* ────────────────── بناء العرض ────────────────── */

function buildRootView(categories, prefix, totalCommands) {
    const lines = [];
    const line = '─────────────────────';

    lines.push(`╭${line}`);
    lines.push(`│  *${config.botName}*`);
    lines.push(`│  الإصدار: ${config.version}`);
    lines.push(`│  البريفكس: ${prefix === '' ? '(بدون)' : prefix}`);
    lines.push(`│  عدد الأوامر: ${totalCommands}`);
    lines.push(`│  التشغيل: ${uptime()}`);
    lines.push(`╰${line}`);
    lines.push('');

    const entries = Object.entries(categories).sort(([a], [b]) => a.localeCompare(b, 'ar'));

    for (const [category, items] of entries) {
        const icon = CATEGORY_ICONS[category] || '📁';
        lines.push(`╭─ ${icon} *${category}* (${items.length})`);
        const commands = items
            .map(item => `${prefix}${item.command}`)
            .sort((a, b) => a.localeCompare(b, 'ar'));

        for (const chunk of chunkArray(commands, 3)) {
            lines.push(`│ ${chunk.join('  •  ')}`);
        }
        lines.push(`╰────────────`);
        lines.push('');
    }

    lines.push(`📖 لتفاصيل قسم معيّن: *${prefix}اوامر <اسم القسم>*`);
    lines.push(`📣 القناة: ${config.channel?.link || ''}`);
    lines.push('');
    lines.push(`> ${config.botName}`);

    return lines.join('\n');
}

function buildCategoryView(categories, requested, prefix, allPlugins) {
    const key = Object.keys(categories).find(category =>
        category === requested ||
        category.includes(requested) ||
        requested.includes(category)
    );

    // ربما طلب المستخدم أمراً بعينه بدلاً من قسم
    if (!key) {
        const wanted = requested.replace(prefix, '').toLowerCase();
        const plugin = allPlugins.find(item =>
            item.command === wanted || item.commands?.includes(wanted)
        );
        if (plugin) return buildCommandView(plugin, prefix);

        return [
            `❌ لا يوجد قسم أو أمر بالاسم: *${requested}*`,
            '',
            `الأقسام المتاحة: ${Object.keys(categories).join(' • ')}`,
            '',
            `> ${config.botName}`
        ].join('\n');
    }

    const items = [...categories[key]].sort((a, b) =>
        String(a.command).localeCompare(String(b.command), 'ar')
    );
    const icon = CATEGORY_ICONS[key] || '📁';
    const lines = [`╭─ ${icon} *${key}* — ${items.length} أمر`, '│'];

    for (const item of items) {
        lines.push(`│ ⌗ *${prefix}${item.command}*`);
        if (item.description) lines.push(`│    ${item.description}`);
        const aliases = (item.commands || []).filter(alias => alias !== item.command);
        if (aliases.length) lines.push(`│    البدائل: ${aliases.map(alias => prefix + alias).join(' , ')}`);
        if (item.usage) lines.push(`│    مثال: ${Array.isArray(item.usage) ? prefix + item.usage[0] : item.usage}`);
        lines.push('│');
    }

    lines.push('╰────────────');
    lines.push('');
    lines.push(`> ${config.botName}`);
    return lines.join('\n');
}

function buildCommandView(plugin, prefix) {
    const aliases = (plugin.commands || []).filter(alias => alias !== plugin.command);
    return [
        `╭─ ⌗ *${prefix}${plugin.command}*`,
        `│ القسم: ${plugin.category || 'عام'}`,
        `│ الوصف: ${plugin.description || 'بدون وصف'}`,
        `│ الاستخدام: ${Array.isArray(plugin.usage) ? prefix + plugin.usage[0] : (plugin.usage || prefix + plugin.command)}`,
        aliases.length ? `│ البدائل: ${aliases.map(alias => prefix + alias).join(' , ')}` : '│ البدائل: لا يوجد',
        '╰────────────',
        '',
        `> ${config.botName}`
    ].join('\n');
}

/* ────────────────── أدوات ────────────────── */

function uniquePlugins(plugins) {
    return [...new Set(Object.values(plugins || {}))]
        .filter(plugin => plugin && plugin.command && plugin.command !== 'menu');
}

function groupByCategory(plugins) {
    return plugins.reduce((groups, plugin) => {
        const category = plugin.category || 'عام';
        if (!groups[category]) groups[category] = [];
        groups[category].push(plugin);
        return groups;
    }, {});
}

function chunkArray(items, size) {
    const output = [];
    for (let index = 0; index < items.length; index += size) {
        output.push(items.slice(index, index + size));
    }
    return output;
}

function uptime() {
    const total = Math.floor(process.uptime());
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours) return `${hours} ساعة ${minutes} دقيقة`;
    if (minutes) return `${minutes} دقيقة ${seconds} ثانية`;
    return `${seconds} ثانية`;
}
