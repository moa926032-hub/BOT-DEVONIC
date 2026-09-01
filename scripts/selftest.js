/**
 * فحص ذاتي — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 * يشغّل: node scripts/selftest.js
 *
 * يتحقق من:
 *  • تحميل كل الإضافات بدون أخطاء
 *  • عدم تكرار الأوامر بين الإضافات
 *  • أن كل رسالة تُرسل تحمل هوية التوجيه من القناة
 *  • عمل مشاهدة الاستوري والتفاعل بقلب
 *  • عمل شرط جروب المطور (سماح / منع)
 *  • عمل أمر القائمة وأوامر التحميل/البحث منطقياً (بدون شبكة)
 */

const path = require('path');
const config = require('../config');

let passed = 0;
let failed = 0;

function ok(label, extra = '') {
    passed += 1;
    console.log(`\x1b[32m✔\x1b[0m ${label}${extra ? ` — ${extra}` : ''}`);
}

function fail(label, error) {
    failed += 1;
    console.log(`\x1b[31m✘\x1b[0m ${label} — ${error?.message || error}`);
}

function assert(condition, label, detail = '') {
    if (condition) ok(label, detail);
    else fail(label, new Error(detail || 'الشرط غير محقق'));
}

/* ─────────── مقبس وهمي لتسجيل الرسائل ─────────── */
function makeMockSocket() {
    const sent = [];
    const read = [];
    return {
        sent,
        read,
        user: { id: '201234567890:12@s.whatsapp.net', lid: '111222333@lid' },
        ev: { on: () => {} },
        sendMessage: async (jid, content, options) => {
            sent.push({ jid, content, options });
            return { key: { id: `mock-${sent.length}`, remoteJid: jid } };
        },
        readMessages: async keys => { read.push(...keys); },
        groupMetadata: async () => ({ participants: [] }),
        groupFetchAllParticipating: async () => ({}),
        groupGetInviteInfo: async () => ({ id: 'mock-group@g.us' }),
        groupAcceptInvite: async () => 'mock-group@g.us'
    };
}

function mockMessage(text, chat = '201111111111@s.whatsapp.net') {
    return {
        key: { remoteJid: chat, id: `M${Math.random().toString(36).slice(2)}`, fromMe: false },
        message: { conversation: text },
        pushName: 'Tester'
    };
}

async function main() {
    console.log(`\n=== فحص ${config.botName} ===\n`);

    /* 1) الإعدادات والحقوق */
    assert(config.botName === '𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚', 'اسم البوت والحقوق', config.botName);
    assert(config.channel.jid === '0029VbC75tvHltY0oNSC4m3z@newsletter', 'معرّف قناة التوجيه', config.channel.jid);
    assert(config.devGroup.code === 'LXJShVjFa0aIDbr2cn1DRd', 'كود جروب المطور', config.devGroup.code);
    assert(config.status.autoReact && config.status.emoji === '❤️', 'إعداد التفاعل بقلب');
    assert(config.status.autoView && config.status.delayMs === 0, 'المشاهدة الفورية للاستوري');

    /* 2) تحميل كل الإضافات */
    const { loadPlugins } = require('../handlers/plugins');
    let plugins = {};
    try {
        plugins = await loadPlugins(true);
        const unique = [...new Set(Object.values(plugins))];
        assert(unique.length > 40, 'تحميل الإضافات', `${unique.length} إضافة / ${Object.keys(plugins).length} أمر`);
    } catch (error) {
        fail('تحميل الإضافات', error);
    }

    /* 3) الأوامر المطلوبة موجودة */
    for (const command of [
        'menu', 'اوامر', 'تحميل', 'اغنيه', 'فيديو', 'بحث',
        'يوتيوب', 'تيك', 'بحث_تيك', 'بين', 'انستا', 'فيس',
        'سبوتيفاي', 'ميديافاير'
    ]) {
        assert(Boolean(plugins[command]), `الأمر متاح: .${command}`);
    }

    /* 4) هوية التوجيه من القناة على كل الرسائل */
    const { applyBranding } = require('../utils/branding');
    const sock = applyBranding(makeMockSocket());

    await sock.sendMessage('x@s.whatsapp.net', { text: 'مرحبا' });
    await sock.sendMessage('x@s.whatsapp.net', { image: { url: 'http://a/b.jpg' }, caption: 'صورة' });
    await sock.sendMessage('x@s.whatsapp.net', { react: { text: '✅', key: { id: '1' } } });

    const textMsg = sock.sent[0].content;
    const imageMsg = sock.sent[1].content;
    const reactMsg = sock.sent[2].content;

    assert(
        textMsg.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid === config.channel.jid &&
        textMsg.contextInfo.isForwarded === true,
        'الرسائل النصية معاد توجيهها من القناة'
    );
    assert(
        imageMsg.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid === config.channel.jid,
        'رسائل الوسائط معاد توجيهها من القناة'
    );
    assert(!reactMsg.contextInfo, 'التفاعلات لا تُلمس (سلوك صحيح)');
    assert(
        textMsg.contextInfo.forwardedNewsletterMessageInfo.newsletterName === config.botName,
        'اسم القناة في الرسائل', textMsg.contextInfo.forwardedNewsletterMessageInfo.newsletterName
    );

    /* 5) الاستوري: مشاهدة + قلب */
    const statusWatcher = require('../utils/status');
    const statusSock = makeMockSocket();
    const statusMsg = {
        key: {
            remoteJid: 'status@broadcast',
            id: 'ST1',
            participant: '209999999999@s.whatsapp.net'
        },
        message: { imageMessage: {} }
    };

    const handledStatus = await statusWatcher.handleStatus(statusSock, statusMsg);
    assert(handledStatus === true, 'التعرف على الاستوري');
    assert(statusSock.read.length === 1, 'مشاهدة الاستوري فوراً (أول مشاهد)');
    const statusReaction = statusSock.sent.find(item => item.content?.react);
    assert(statusReaction?.content.react.text === '❤️', 'التفاعل بقلب مع الاستوري');
    assert(statusReaction?.jid === 'status@broadcast', 'إرسال التفاعل لقناة الحالات');

    // عدم تكرار التفاعل مع نفس الاستوري
    await statusWatcher.handleStatus(statusSock, statusMsg);
    assert(statusSock.sent.filter(item => item.content?.react).length === 1, 'عدم تكرار التفاعل لنفس الاستوري');

    /* 6) شرط جروب المطور */
    const devGroup = require('../utils/devGroup');
    const memberSock = makeMockSocket();
    memberSock.groupFetchAllParticipating = async () => ({ 'mock-group@g.us': { id: 'mock-group@g.us' } });
    const allowed = await devGroup.verify(memberSock);
    assert(allowed === true && devGroup.isAllowed() === true, 'البوت عضو في الجروب → التشغيل طبيعي');

    devGroup.state.groupJid = '';
    const outsiderSock = makeMockSocket();
    outsiderSock.groupFetchAllParticipating = async () => ({});
    outsiderSock.groupMetadata = async () => ({ participants: [] });
    outsiderSock.groupAcceptInvite = async () => { throw new Error('لا يمكن الانضمام'); };
    const blocked = await devGroup.verify(outsiderSock);
    assert(blocked === false && devGroup.isAllowed() === false, 'البوت خارج الجروب → إيقاف الأوامر');

    // نعيد الحالة للسماح ببقية الفحوصات
    devGroup.state.member = true;

    /* 7) أمر القائمة */
    const menuSock = applyBranding(makeMockSocket());
    const menuMsg = mockMessage('.اوامر');
    try {
        await plugins['menu'].execute(menuSock, menuMsg, []);
        const out = menuSock.sent[0]?.content || {};
        const body = out.caption || out.text || '';
        assert(Boolean(body), 'أمر القائمة يرسل رداً');
        assert(body.includes(config.botName), 'القائمة تحمل حقوق البوت');
        assert(/الوسائط|البحث|المجموعات/.test(body), 'القائمة تعرض الأقسام');
        assert(
            out.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid === config.channel.jid,
            'القائمة معاد توجيهها من القناة'
        );
    } catch (error) {
        fail('أمر القائمة', error);
    }

    /* 8) أوامر التحميل/البحث ترد بالإرشادات عند غياب المدخلات */
    for (const [command, needle] of [
        ['تحميل', 'تحميل'],
        ['اغنيه', 'اسم'],
        ['بحث', 'كلمة البحث'],
        ['تيك', 'تيك توك'],
        ['بين', 'البحث'],
        ['انستا', 'إنستغرام'],
        ['فيس', 'الفيديو'],
        ['ميديافاير', 'ميديا فاير']
    ]) {
        const localSock = applyBranding(makeMockSocket());
        try {
            const plugin = plugins[command];
            const message = mockMessage(`.${command}`);
            message.command = command;
            await plugin.execute(localSock, message, []);
            const body = localSock.sent.map(item => item.content?.text || '').join('\n');
            assert(body.includes(needle), `أمر .${command} يعمل ويرشد المستخدم`);
        } catch (error) {
            fail(`أمر .${command}`, error);
        }
    }

    /* 9) معالج الأوامر يمرّر args (كان العطل الأساسي) */
    const handler = require('../handlers/handler');
    const argSock = applyBranding(makeMockSocket());
    let capturedArgs = null;
    plugins['__test__'] = {
        command: '__test__',
        commands: ['__test__'],
        description: 'اختبار',
        execute: async (s, m, args) => { capturedArgs = args; }
    };
    await handler.handleMessages(argSock, {
        messages: [mockMessage('.__test__ اول تاني https://x.com/1')]
    });
    assert(
        Array.isArray(capturedArgs) && capturedArgs.length === 3 && capturedArgs[2] === 'https://x.com/1',
        'المعالج يمرّر args للأوامر', JSON.stringify(capturedArgs)
    );

    /* 10) yt-dlp متاح أو قابل للتثبيت */
    try {
        const ytdlp = require('../utils/ytdlp');
        const binary = await ytdlp.resolveBinary();
        ok('محرك التحميل yt-dlp جاهز', binary);
    } catch (error) {
        fail('محرك التحميل yt-dlp', error);
    }

    console.log(`\n=== النتيجة: ${passed} ناجح / ${failed} فاشل ===\n`);
    process.exit(failed ? 1 : 0);
}

main().catch(error => {
    console.error('فشل الفحص:', error);
    process.exit(1);
});
