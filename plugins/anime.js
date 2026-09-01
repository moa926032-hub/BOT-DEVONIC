/**
 * بحث الأنمي وأخبار الأنمي — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * كان هذا الأمر معتمداً على مكتبة meowsab غير المتاحة، وعلى رسائل أزرار
 * لا يسلّمها الواتساب لحسابات البوتات. أُعيد بناؤه على مزود مختبر
 * (AniList عبر واجهة عامة) مع رد نصي مرفق بصورة الغلاف.
 */

const axios = require('axios');
const config = require('../config.js');
const { reply, sendImage } = require('../utils/send.js');

const BASE = 'https://emam-api.web.id/home/sections/Search/api';

const http = axios.create({
    timeout: 45000,
    maxRedirects: 5,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        Accept: 'application/json'
    },
    validateStatus: () => true
});

function stripTags(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function pickTitle(item) {
    if (typeof item.title === 'string') return item.title;
    return item.title?.romaji || item.title?.english || item.title?.native || 'بدون عنوان';
}

async function searchAnime(query) {
    const response = await http.get(`${BASE}/anime/search`, { params: { q: query } });
    const results = response.data?.data?.results;
    if (!response.data?.status || !Array.isArray(results) || !results.length) {
        throw new Error('لم يتم العثور على نتائج');
    }
    return results.slice(0, 8).map(item => ({
        title: pickTitle(item),
        score: item.averageScore || item.meanScore || 0,
        episodes: item.episodes || 0,
        status: item.status || '',
        format: item.format || '',
        year: item.startDate?.year || item.seasonYear || '',
        genres: Array.isArray(item.genres) ? item.genres.slice(0, 4) : [],
        cover: item.coverImage?.extraLarge || item.coverImage?.large || '',
        description: stripTags(item.description).slice(0, 260),
        url: item.siteUrl || (item.id ? `https://anilist.co/anime/${item.id}` : '')
    }));
}

async function animeNews() {
    const response = await http.get(`${BASE}/anime/news`);
    const data = response.data?.data;
    if (!response.data?.status || !data) throw new Error('تعذر جلب الأخبار');

    const items = [];
    for (const [group, list] of Object.entries(data)) {
        if (!Array.isArray(list)) continue;
        for (const entry of list.slice(0, 2)) {
            items.push({
                group,
                title: entry.title || '',
                description: stripTags(entry.description).slice(0, 180),
                url: entry.url || entry.link || ''
            });
        }
        if (items.length >= 8) break;
    }

    if (!items.length) throw new Error('لا توجد أخبار متاحة');
    return items;
}

module.exports = {
    command: ['انمي', 'أنمي', 'anime', 'اخبار_انمي', 'أخبار_انمي'],
    description: 'بحث عن أنمي بالاسم أو عرض أحدث أخبار الأنمي',
    usage: '.انمي naruto  |  .اخبار_انمي',
    category: 'search',

    async execute(sock, msg, args = []) {
        const chatId = msg.key.remoteJid;
        const raw = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const isNews = /اخبار|أخبار/.test(raw.split(/\s+/)[0] || '');
        const query = (Array.isArray(args) ? args.join(' ') : '').trim();

        try {
            if (isNews) {
                const news = await animeNews();
                const body = news
                    .map((item, index) => {
                        const link = item.url ? `\n🔗 ${item.url}` : '';
                        return `*${index + 1}.* ${item.title}\n${item.description}${link}`;
                    })
                    .join('\n\n');

                return reply(sock, msg, `📰 *أحدث أخبار الأنمي*\n\n${body}\n\n> ${config.botName}`);
            }

            if (!query) {
                return reply(sock, msg,
                    `📺 *بحث الأنمي*\n\n` +
                    `الاستخدام:\n` +
                    `• ${config.prefix}انمي naruto\n` +
                    `• ${config.prefix}انمي one piece\n` +
                    `• ${config.prefix}اخبار_انمي\n\n> ${config.botName}`
                );
            }

            const results = await searchAnime(query);
            const top = results[0];

            const lines = results.map((item, index) => {
                const meta = [
                    item.format,
                    item.year ? `${item.year}` : '',
                    item.episodes ? `${item.episodes} حلقة` : '',
                    item.score ? `⭐ ${item.score}%` : ''
                ].filter(Boolean).join(' • ');
                return `*${index + 1}.* ${item.title}\n   ${meta}`;
            }).join('\n');

            const caption =
                `📺 *نتائج البحث عن:* ${query}\n\n${lines}\n\n` +
                `━━━━━━━━━━━━━━\n` +
                `*${top.title}*\n` +
                (top.genres.length ? `🏷️ ${top.genres.join(' • ')}\n` : '') +
                (top.description ? `\n${top.description}...\n` : '') +
                (top.url ? `\n🔗 ${top.url}\n` : '') +
                `\n> ${config.botName}`;

            if (top.cover) {
                try {
                    return await sendImage(sock, msg, top.cover, caption);
                } catch (_) {
                    /* إن فشلت الصورة نرسل النص */
                }
            }

            return reply(sock, msg, caption);
        } catch (error) {
            return reply(sock, msg, `❌ تعذر تنفيذ الطلب: ${error.message}\n\n> ${config.botName}`);
        }
    }
};
