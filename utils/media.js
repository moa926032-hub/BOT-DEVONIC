/**
 * محرك الوسائط الموحّد — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * كل أوامر التحميل والبحث تمرّ من هنا. المبدأ: لكل مهمة عدة مزوّدات
 * (providers) بالترتيب، فإذا فشل الأول يُجرّب الذي بعده — لذلك لا يتوقف
 * الأمر عن العمل عند سقوط أي موقع خارجي.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const logger = require('./console');
const ytdlp = require('./ytdlp');
const remote = require('./remote');

const ROOT = path.join(__dirname, '..');
const TEMP_DIR = path.join(ROOT, config.media?.tempDirName || 'temp');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const http = axios.create({
    timeout: 25000,
    maxRedirects: 6,
    headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.9' },
    validateStatus: () => true
});

/* ────────────────────── أدوات مساعدة ────────────────────── */

function ensureTempDir() {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    return TEMP_DIR;
}

function cleanup(files) {
    for (const file of [].concat(files || [])) {
        if (!file) continue;
        fs.promises.unlink(file).catch(() => {});
    }
}

/** حذف الملفات المؤقتة الأقدم من ساعة */
function sweepTemp() {
    try {
        if (!fs.existsSync(TEMP_DIR)) return;
        const limit = Date.now() - 60 * 60 * 1000;
        for (const name of fs.readdirSync(TEMP_DIR)) {
            const file = path.join(TEMP_DIR, name);
            const stat = fs.statSync(file);
            if (stat.isFile() && stat.mtimeMs < limit) fs.unlinkSync(file);
        }
    } catch { /* غير مهم */ }
}

const PLATFORMS = [
    { name: 'يوتيوب', key: 'youtube', test: /youtube\.com|youtu\.be|music\.youtube/i },
    { name: 'تيك توك', key: 'tiktok', test: /tiktok\.com|douyin\.com|vt\.tiktok/i },
    { name: 'إنستغرام', key: 'instagram', test: /instagram\.com|instagr\.am/i },
    { name: 'فيسبوك', key: 'facebook', test: /facebook\.com|fb\.watch|fb\.me/i },
    { name: 'تويتر / X', key: 'twitter', test: /twitter\.com|x\.com/i },
    { name: 'سناب شات', key: 'snapchat', test: /snapchat\.com/i },
    { name: 'بينترست', key: 'pinterest', test: /pinterest\.|pin\.it/i },
    { name: 'ساوند كلاود', key: 'soundcloud', test: /soundcloud\.com/i },
    { name: 'سبوتيفاي', key: 'spotify', test: /open\.spotify\.com/i },
    { name: 'ميديا فاير', key: 'mediafire', test: /mediafire\.com/i },
    { name: 'تويتش', key: 'twitch', test: /twitch\.tv/i },
    { name: 'ريديت', key: 'reddit', test: /reddit\.com|redd\.it/i }
];

function detectPlatform(url) {
    return PLATFORMS.find(item => item.test.test(String(url || ''))) || null;
}

function extractUrl(text) {
    const match = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0] : null;
}

function humanViews(value) {
    const number = Number(value) || 0;
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
    return String(number);
}

/* ────────────────────── التحميل ────────────────────── */

/**
 * تحميل أي رابط مدعوم كملف على القرص.
 * @returns {Promise<{file:string, sizeMb:number, info:object, platform:object|null, all:string[]}>}
 */
async function download(url, mode = 'video') {
    const clean = extractUrl(url) || String(url || '').trim();
    if (!/^https?:\/\//i.test(clean)) throw new Error('الرابط غير صالح');

    const platform = detectPlatform(clean);
    const wanted = mode === 'audio' ? 'audio' : 'video';
    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(clean);
    sweepTemp();
    ensureTempDir();

    const errors = [];

    /* المحرك الأول: yt-dlp محلياً (أفضل جودة وأوسع دعم) */
    try {
        let info = {};
        try {
            info = await ytdlp.getInfo(clean);
        } catch (error) {
            errors.push(`معلومات yt-dlp: ${error.message}`);
        }

        const result = await ytdlp.downloadMedia(clean, wanted, TEMP_DIR);
        const file = wanted === 'audio' ? result.file : await remote.ensurePlayable(result.file);
        const sizeMb = fs.existsSync(file) ? fs.statSync(file).size / (1024 * 1024) : result.sizeMb;

        return {
            ...result,
            file,
            sizeMb,
            all: [...new Set([...(result.all || []), file])],
            provider: 'yt-dlp',
            platform,
            info: {
                title: info.title || info.fulltitle || 'ملف',
                uploader: info.uploader || info.channel || info.uploader_id || '',
                duration: info.duration || 0,
                durationText: ytdlp.formatDuration(info.duration),
                thumbnail: info.thumbnail || '',
                views: info.view_count || 0,
                webpage: info.webpage_url || clean
            }
        };
    } catch (error) {
        errors.push(`yt-dlp: ${error.message}`);
        logger.warn(`yt-dlp لم ينجح، جاري تجربة المزودات الخارجية...`);
    }

    /* المحرك الاحتياطي: مزودات خارجية (تعمل رغم حجب السيرفر) */
    const chain = isYouTube
        ? [remote.youtubeDownload, remote.universalDownload]
        : [remote.universalDownload, remote.youtubeDownload];

    for (const provider of chain) {
        try {
            const result = await provider(clean, wanted, TEMP_DIR);
            return {
                ...result,
                platform,
                info: {
                    ...result.info,
                    durationText: ytdlp.formatDuration(result.info?.duration)
                }
            };
        } catch (error) {
            errors.push(error.message);
        }
    }

    throw new Error(errors.slice(0, 3).join(' | ') || 'تعذر التحميل');
}

/** جلب معلومات فقط (بدون تنزيل) */
async function inspect(url) {
    const clean = extractUrl(url) || String(url || '').trim();

    let info;
    try {
        info = await ytdlp.getInfo(clean);
    } catch (primaryError) {
        /* بديل عند حجب السيرفر: المزود العام */
        try {
            const external = await remote.universalInfo(clean);
            info = {
                title: external.title,
                uploader: external.author,
                duration: external.duration,
                thumbnail: external.thumbnail,
                view_count: external.views,
                webpage_url: external.webpage
            };
        } catch (_) {
            throw primaryError;
        }
    }

    return {
        title: info.title || 'بدون عنوان',
        uploader: info.uploader || info.channel || '',
        duration: info.duration || 0,
        durationText: ytdlp.formatDuration(info.duration),
        thumbnail: info.thumbnail || '',
        views: info.view_count || 0,
        webpage: info.webpage_url || clean,
        platform: detectPlatform(clean)
    };
}

/* ────────────────────── بحث يوتيوب ────────────────────── */

async function searchYouTubeApi(query, limit) {
    const response = await http.get(
        'https://emam-api.web.id/home/sections/Search/api/YouTube/search',
        { params: { q: query } }
    );
    const items = response.data?.data;
    if (!Array.isArray(items) || !items.length) throw new Error('لا نتائج من المزوّد');

    return items.slice(0, limit).map(item => ({
        id: item.videoId,
        title: item.title || 'بدون عنوان',
        url: item.url || `https://www.youtube.com/watch?v=${item.videoId}`,
        duration: 0,
        durationText: item.timestamp || item.duration || 'غير معروف',
        channel: item.channel?.name || item.author || '',
        views: item.views || 0,
        thumbnail: item.image || item.thumbnail || ''
    }));
}

/** بحث يوتيوب مع مزوّدين احتياطيين */
async function searchYouTube(query, limit = config.media?.searchResults || 8) {
    const errors = [];

    for (const provider of [
        () => ytdlp.search(query, limit),
        () => searchYouTubeApi(query, limit)
    ]) {
        try {
            const results = await provider();
            if (results?.length) return results;
            errors.push('لا نتائج');
        } catch (error) {
            errors.push(error.message);
        }
    }

    throw new Error(`فشل البحث في يوتيوب (${errors.join(' | ')})`);
}

/* ────────────────────── بحث تيك توك ────────────────────── */

function mapTikwm(items, limit) {
    return items.slice(0, limit).map(item => ({
        title: item.title || 'بدون عنوان',
        author: item.author?.nickname || item.author?.unique_id || '',
        video: item.hdplay || item.play || item.wmplay,
        music: item.music,
        cover: item.cover || item.origin_cover || '',
        views: item.play_count || 0,
        likes: item.digg_count || 0,
        url: item.video_id ? `https://www.tiktok.com/@_/video/${item.video_id}` : ''
    })).filter(item => item.video);
}

async function tikwmSearch(query, limit) {
    const response = await http.post(
        'https://tikwm.com/api/feed/search',
        new URLSearchParams({ keywords: query, count: String(limit), cursor: '0', HD: '1' }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const items = response.data?.data?.videos;
    if (!Array.isArray(items) || !items.length) throw new Error('لا نتائج من tikwm');
    return mapTikwm(items, limit);
}

async function tikwmSearchGet(query, limit) {
    const response = await http.get('https://www.tikwm.com/api/feed/search', {
        params: { keywords: query, count: limit, cursor: 0, hd: 1 }
    });
    const items = response.data?.data?.videos;
    if (!Array.isArray(items) || !items.length) throw new Error('لا نتائج من tikwm (GET)');
    return mapTikwm(items, limit);
}

async function emamTikTokSearch(query, limit) {
    const response = await http.get(
        'https://www.emam-api.web.id/home/sections/Search/api/tiktok/videos',
        { params: { q: query } }
    );
    const items = response.data?.data;
    if (!Array.isArray(items) || !items.length) throw new Error('لا نتائج من المزوّد');
    return items.slice(0, limit).map(item => ({
        title: item.title || 'بدون عنوان',
        author: item.author || '',
        video: item.no_watermark || item.video || item.play,
        music: item.music,
        cover: item.cover || '',
        views: item.play_count || 0,
        likes: item.digg_count || 0,
        url: item.url || ''
    })).filter(item => item.video);
}

/**
 * مزود أخير: البحث عن روابط تيك توك عبر محرك بحث عام، ثم حلّ كل رابط
 * عبر المزود العام لاستخراج الفيديو بدون علامة مائية.
 */
async function webTikTokSearch(query, limit) {
    const response = await http.get('https://www.bing.com/search', {
        params: { q: `site:tiktok.com/video ${query}`, count: 30 }
    });
    const html = String(response.data || '');
    const links = [...new Set(
        [...html.matchAll(/https:\/\/www\.tiktok\.com\/@[A-Za-z0-9._-]+\/video\/\d+/g)].map(m => m[0])
    )].slice(0, limit);

    if (!links.length) throw new Error('لا نتائج من محرك البحث العام');

    const resolved = await Promise.all(links.map(async link => {
        try {
            const info = await remote.universalInfo(link);
            const video = info.medias.find(item => /hd_no_watermark/i.test(item.quality))
                || info.medias.find(item => /no_watermark/i.test(item.quality))
                || info.medias.find(item => item.type !== 'audio');
            if (!video?.url) return null;
            return {
                title: info.title || 'بدون عنوان',
                author: info.author || '',
                video: video.url,
                music: info.medias.find(item => item.type === 'audio')?.url,
                cover: info.thumbnail || '',
                views: info.views || 0,
                likes: 0,
                url: link
            };
        } catch (_) {
            return null;
        }
    }));

    const items = resolved.filter(Boolean);
    if (!items.length) throw new Error('تعذر تحويل نتائج البحث إلى فيديوهات');
    return items;
}

async function searchTikTok(query, limit = 5) {
    const errors = [];
    for (const provider of [tikwmSearch, tikwmSearchGet, emamTikTokSearch, webTikTokSearch]) {
        try {
            const results = await provider(query, limit);
            if (results?.length) return results;
            errors.push('لا نتائج');
        } catch (error) {
            errors.push(error.message);
        }
    }
    throw new Error(`فشل بحث تيك توك (${errors.join(' | ')})`);
}

/** تحميل فيديو تيك توك: مزوّد سريع ثم yt-dlp */
async function tiktokDownload(url) {
    try {
        const response = await http.get('https://tikwm.com/api/', {
            params: { url, hd: 1 }
        });
        const data = response.data?.data;
        if (data?.play || data?.hdplay) {
            return {
                type: 'url',
                video: data.hdplay || data.play,
                music: data.music,
                title: data.title || '',
                author: data.author?.nickname || '',
                cover: data.cover || ''
            };
        }
    } catch (error) {
        logger.warn(`مزوّد تيك توك السريع فشل: ${error.message}`);
    }

    /* مزود عام مختبر: يرجع روابط CDN مباشرة بدون علامة مائية */
    try {
        const external = await remote.universalInfo(url);
        const video = external.medias.find(item => /hd_no_watermark/i.test(item.quality))
            || external.medias.find(item => /no_watermark/i.test(item.quality))
            || external.medias.find(item => item.type !== 'audio');
        const music = external.medias.find(item => item.type === 'audio');

        if (video?.url) {
            return {
                type: 'url',
                video: video.url,
                music: music?.url,
                title: external.title || '',
                author: external.author || '',
                cover: external.thumbnail || ''
            };
        }
    } catch (error) {
        logger.warn(`المزود العام لتيك توك فشل: ${error.message}`);
    }

    const result = await download(url, 'video');
    return {
        type: 'file',
        file: result.file,
        all: result.all,
        title: result.info.title,
        author: result.info.uploader,
        cover: result.info.thumbnail
    };
}

/* ────────────────────── بحث الصور / بينترست ────────────────────── */

async function pinterestApi(query, limit) {
    const data = JSON.stringify({
        options: { query, scope: 'pins', page_size: Math.max(limit, 12) },
        context: {}
    });
    const response = await http.get('https://www.pinterest.com/resource/BaseSearchResource/get/', {
        params: { source_url: `/search/pins/?q=${encodeURIComponent(query)}`, data },
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }
    });

    const results = response.data?.resource_response?.data?.results;
    if (!Array.isArray(results) || !results.length) throw new Error('لا نتائج من بينترست');

    return results
        .map(item => ({
            title: item.grid_title || item.title || '',
            url: item.images?.orig?.url || item.images?.['736x']?.url,
            pinUrl: item.id ? `https://www.pinterest.com/pin/${item.id}/` : '',
            owner: item.pinner?.username || ''
        }))
        .filter(item => item.url)
        .slice(0, limit);
}

async function bingImages(query, limit) {
    const response = await http.get('https://www.bing.com/images/search', {
        params: { q: query, form: 'HDRSC2', first: 1 }
    });
    const html = String(response.data || '');
    const matches = [...html.matchAll(/murl&quot;:&quot;(.*?)&quot;/g)]
        .map(match => match[1])
        .filter(Boolean);

    const unique = [...new Set(matches)].slice(0, limit);
    if (!unique.length) throw new Error('لا نتائج من المصدر الاحتياطي');

    return unique.map((url, index) => ({
        title: `${query} — ${index + 1}`,
        url,
        pinUrl: url,
        owner: ''
    }));
}

async function searchImages(query, limit = 8) {
    const errors = [];
    const providers = [
        (q, l) => remote.pinterestImages(q, l).then(items => items.map(item => ({
            title: item.title,
            url: item.url,
            pinUrl: item.page || item.url,
            owner: item.owner
        }))),
        pinterestApi,
        bingImages
    ];
    for (const provider of providers) {
        try {
            const results = await provider(query, limit);
            if (results?.length) return results;
            errors.push('لا نتائج');
        } catch (error) {
            errors.push(error.message);
        }
    }
    throw new Error(`فشل بحث الصور (${errors.join(' | ')})`);
}

/* ────────────────────── ميديا فاير ────────────────────── */

async function mediafire(url) {
    const response = await http.get(url, { headers: { Referer: 'https://www.mediafire.com/' } });
    const html = String(response.data || '');

    const link =
        html.match(/href="((?:https?:)?\/\/download[^"]+)"/i)?.[1] ||
        html.match(/id="downloadButton"[^>]*href="([^"]+)"/i)?.[1];

    if (!link) throw new Error('تعذر استخراج رابط التحميل من ميديا فاير');

    const fileName =
        html.match(/<div class="filename">([^<]+)<\/div>/i)?.[1]?.trim() ||
        decodeURIComponent(link.split('/').pop().split('?')[0]) ||
        'file';
    const size = html.match(/\(([\d.]+\s?[KMGT]?B)\)/i)?.[1] || '';

    return {
        downloadUrl: link.startsWith('//') ? `https:${link}` : link,
        filename: fileName,
        size
    };
}

/* ────────────────────── سبوتيفاي ────────────────────── */

/**
 * سبوتيفاي لا يسمح بالتحميل المباشر، لذلك نجلب بيانات الأغنية من oEmbed
 * ثم نحمّل نسخة الصوت المقابلة من يوتيوب.
 */
async function spotify(url) {
    let title = '';
    try {
        const response = await http.get('https://open.spotify.com/oembed', { params: { url } });
        title = response.data?.title || '';
    } catch { /* نتجاهل */ }

    if (!title) {
        const info = await ytdlp.getInfo(url).catch(() => null);
        title = info?.title ? `${info.title} ${info.artist || ''}`.trim() : '';
    }
    if (!title) throw new Error('تعذر التعرف على الأغنية من رابط سبوتيفاي');

    const [best] = await searchYouTube(`${title} audio`, 1);
    if (!best) throw new Error('لم يتم إيجاد نسخة صوتية للأغنية');

    const result = await download(best.url, 'audio');
    return { ...result, spotifyTitle: title, source: best };
}

module.exports = {
    TEMP_DIR,
    ensureTempDir,
    cleanup,
    sweepTemp,
    detectPlatform,
    extractUrl,
    humanViews,
    download,
    inspect,
    searchYouTube,
    searchTikTok,
    tiktokDownload,
    searchImages,
    mediafire,
    spotify,
    PLATFORMS,
    formatDuration: ytdlp.formatDuration
};
