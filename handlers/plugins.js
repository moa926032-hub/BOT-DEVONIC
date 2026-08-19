const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/console');
const config = require('../config');

let loadedPlugins = {};
let pluginsLoaded = false;

function startsWithPrefix(text) {
    return text.startsWith(config.prefix);
}

async function loadPlugins(force = false) {
    try {
        if (pluginsLoaded && !force) return loadedPlugins;
        const pluginsDir = path.join(__dirname, '../plugins');
        await fs.ensureDir(pluginsDir);
        const files = await fs.readdir(pluginsDir);
        const pluginFiles = files.filter(file => file.endsWith('.js'));
        for (const file of pluginFiles) {
            const pluginPath = path.join(pluginsDir, file);
            delete require.cache[require.resolve(pluginPath)];
        }
        loadedPlugins = {};
        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(pluginsDir, file);
                const plugin = require(pluginPath);
                // The bot contains two plugin generations. Older plugins export
                // the handler function directly, while newer ones export an
                // object with execute(). Normalize both without changing their
                // public command behavior.
                if (typeof plugin === 'function') {
                    plugin.execute = plugin;
                }

                if (plugin && typeof plugin.execute === 'function') {
                    if (!plugin.command) {
                        logger.warn(`تم تجاهل ${file}: لا يوجد اسم أمر`);
                        continue;
                    }

                    const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
                    const aliases = [...new Set(commands.map(command => String(command).trim().toLowerCase()).filter(Boolean))];
                    if (aliases.length === 0) {
                        logger.warn(`تم تجاهل ${file}: اسم الأمر فارغ`);
                        continue;
                    }

                    plugin.commands = aliases;
                    plugin.command = aliases[0];
                    plugin.category = normalizeCategory(plugin.category, plugin, file);
                    plugin.pluginFile = file;
                    plugin.foreign = Boolean(
                        !plugin.description &&
                        (plugin.usage || plugin.admin || plugin.botAdmin ||
                         plugin.owner || plugin.category === 'admin')
                    );

                    for (const alias of aliases) {
                        loadedPlugins[alias] = plugin;
                    }

                    logger.info(`تم تحميل الإضافة: ${aliases.join(', ')}`);
                } else {
                    logger.warn(`تم تجاهل ${file}: لا توجد دالة تنفيذ`);
                }
            } catch (error) {
                logger.error(`فشل تحميل الإضافة ${file}:`, error);
            }
        }
        pluginsLoaded = true;
        return loadedPlugins;
    } catch (error) {
        logger.error('فشل في تحميل الإضافات:', error);
        return {};
    }
}

function normalizeCategory(category, plugin, fileName = '') {
    const value = String(category || '').trim().toLowerCase();
    const explicit = {
        zarf: 'المجموعات',
        group: 'المجموعات',
        groups: 'المجموعات',
        admin: 'الإدارة',
        إدارة: 'الإدارة',
        tools: 'الأدوات',
        tool: 'الأدوات',
        downloads: 'الوسائط',
        download: 'الوسائط',
        games: 'الترفيه',
        game: 'الترفيه',
        owner: 'المطور',
        misc: 'عام',
        general: 'عام',
        developer: 'المطور'
    };
    if (explicit[value]) return explicit[value];
    if (value) return category;

    const commandText = `${plugin.command || ''} ${fileName}`.toLowerCase();
    if (plugin.group || /zarf|group|kick|admin|mute|delete|نسخ|حظر|كتم|طرد|زرف|فنش|فخ|طير|عنصرية|ربيهم/.test(commandText)) {
        return 'المجموعات';
    }
    if (/تحميل|ملصق|topng|stick|icon|pfp|زخرف|عرض|ع$/.test(commandText)) {
        return 'الوسائط';
    }
    if (/اكس|هل|تحرش|لعبة|xo|test|تست/.test(commandText)) {
        return 'الترفيه';
    }
    if (/نخبة|مود|بريفكس|restart|ريستارت|stop|bot|تنظيف|storage|تخزين|ارسل/.test(commandText)) {
        return 'المطور';
    }
    return 'عام';
}

module.exports = {
    loadPlugins,
    getPlugins: () => loadedPlugins,
    normalizeCategory
};