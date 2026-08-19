const { getPlugins } = require('../handlers/plugins.js');

module.exports = {
    status: 'on',
    name: 'Bot Commands',
    command: ['menu', 'اوامر', 'قائمة'],
    category: 'tools',
    description: 'قائمة تفاعلية متداخلة لأوامر البوت',
    hidden: true,
    version: '4.0',

    async execute(sock, msg) {
        try {
            const action = msg.interactiveId || 'menu:root';
            const plugins = uniquePlugins(getPlugins());
            const categories = groupByCategory(plugins);

            if (action === 'menu:root' || action === 'menu:back') {
                return sendRootMenu(sock, msg, categories);
            }

            if (action.startsWith('menu:category:')) {
                const category = decodeURIComponent(action.slice('menu:category:'.length));
                return sendCategoryMenu(sock, msg, categories, category);
            }

            if (action.startsWith('menu:command:')) {
                const command = decodeURIComponent(action.slice('menu:command:'.length));
                const plugin = plugins.find(item =>
                    item.command === command || item.commands?.includes(command)
                );
                if (!plugin) return sendRootMenu(sock, msg, categories);
                return sendCommandDetails(sock, msg, plugin);
            }

            return sendRootMenu(sock, msg, categories);
        } catch (error) {
            console.error('❌ Menu Error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ حدث خطأ أثناء إنشاء القائمة.'
            }, { quoted: msg });
        }
    }
};

function uniquePlugins(plugins) {
    return [...new Set(Object.values(plugins))]
        .filter(plugin => plugin && !plugin.hidden && plugin.command !== 'menu');
}

function groupByCategory(plugins) {
    return plugins.reduce((groups, plugin) => {
        const category = plugin.category || 'عام';
        if (!groups[category]) groups[category] = [];
        groups[category].push(plugin);
        return groups;
    }, {});
}

async function sendRootMenu(sock, msg, categories) {
    const sections = Object.entries(categories)
        .sort(([a], [b]) => a.localeCompare(b, 'ar'))
        .map(([category, plugins]) => ({
            title: category,
            rows: [{
                title: `فتح قسم ${category}`,
                description: `${plugins.length} أمر`,
                rowId: `menu:category:${encodeURIComponent(category)}`
            }]
        }));

    return sock.sendMessage(msg.key.remoteJid, {
        title: 'Anastasia',
        text: 'اختر قسمًا لعرض أوامره',
        footer: 'القائمة الرئيسية',
        buttonText: 'عرض الأقسام',
        sections
    }, { quoted: msg });
}

async function sendCategoryMenu(sock, msg, categories, category) {
    const plugins = categories[category];
    if (!plugins) return sendRootMenu(sock, msg, categories);

    return sock.sendMessage(msg.key.remoteJid, {
        title: category,
        text: `اختر أمرًا من قسم ${category}`,
        footer: 'يمكنك الرجوع للقائمة الرئيسية',
        buttonText: 'عرض الأوامر',
        sections: [{
            title: category,
            rows: [
                ...plugins
                    .sort((a, b) => String(a.command).localeCompare(String(b.command), 'ar'))
                    .map(plugin => ({
                        title: `.${plugin.command}`,
                        description: plugin.description || 'بدون وصف',
                        rowId: `menu:command:${encodeURIComponent(plugin.command)}`
                    })),
                { title: 'رجوع للأقسام', rowId: 'menu:back' }
            ]
        }]
    }, { quoted: msg });
}

async function sendCommandDetails(sock, msg, plugin) {
    const aliases = plugin.commands?.filter(command => command !== plugin.command) || [];
    const aliasText = aliases.length
        ? `\nالبدائل: ${aliases.map(alias => `.${alias}`).join(' - ')}`
        : '';

    return sock.sendMessage(msg.key.remoteJid, {
        text: `*${plugin.category}*\n\n*الأمر:* .${plugin.command}\n*الوصف:* ${plugin.description || 'بدون وصف'}\n*الاستخدام:* ${plugin.usage || `.${plugin.command}`}${aliasText}\n\nاكتب الأمر يدويًا لتنفيذه.`,
        buttons: [{
            buttonId: 'menu:back',
            buttonText: { displayText: 'رجوع للأقسام' },
            type: 1
        }],
        headerType: 1
    }, { quoted: msg });
}