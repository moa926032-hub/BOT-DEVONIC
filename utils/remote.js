/**
 * utils/remote.js — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * طبقة مزودات خارجية للتحميل، تعمل كخط دفاع ثانٍ عندما يفشل yt-dlp
 * (مثل رسالة "Sign in to confirm you're not a bot" على سيرفرات VPS).
 *
 * كل المزودات هنا مُختبرة فعلياً:
 *   • saveVid/youtube      → يوتيوب فيديو 144..1080 + mp3   (خطوتان: key ثم download_url)
 *   • Youtube/ymcdn        → يوتيوب صوت mp3 مباشر
 *   • api/api/download     → تيك توك / فيسبوك / تويتر / عام (روابط CDN مباشرة)
 *   • pinterest/image      → بحث صور
 *
 * ملاحظة مهمة: روابط googlevideo القادمة من api/api/download مقيّدة بعنوان
 * IP السيرفر الذي جلبها، لذلك لا نستخدمها للتحميل — نستخدم saveVid بدلاً منها.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const config = require('../config');
const logger = require('./console');

const EMAM = 'https://emam-api.web.id/home/sections';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const http = axios.create({
    timeout: 60000,
    maxRedirects: 5,
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
    validateStatus: () => true
});

const MAX_MB = config.media?.maxFileSizeMb || 90;

/* ───────────────────────── أدوات مساعدة ───────────────────────── */

function safeName(text, fallback = 'devonic') {
    const base = String(text || '')
        .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
    return base || fallback;
}

function youtubeId(url) {
    const patterns = [
        /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|\/live\/)([A-Za-z0-9_-]{11})/,
        /^([A-Za-z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = String(url || '').match(pattern);
        if (match) return match[1];
    }
    return null;
}

/** تنزيل رابط مباشر إلى ملف على القرص مع احترام الحد الأقصى للحجم */
async function fetchToFile(url, filePath, referer = '') {
    const headers = { 'User-Agent': UA };
    if (referer) headers.Referer = referer;

    const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 180000,
        maxRedirects: 10,
        headers,
        validateStatus: () => true
    });

    if (response.status >= 400) {
        response.data?.destroy?.();
        throw new Error(`فشل التنزيل (HTTP ${response.status})`);
    }

    const declared = Number(response.headers['content-length'] || 0);
    if (declared && declared / (1024 * 1024) > MAX_MB) {
        response.data.destroy();
        throw new Error(`حجم الملف ${(declared / (1024 * 1024)).toFixed(1)}MB أكبر من الحد المسموح ${MAX_MB}MB`);
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath);
        let written = 0;
        let aborted = false;

        response.data.on('data', chunk => {
            written += chunk.length;
            if (!aborted && written / (1024 * 1024) > MAX_MB) {
                aborted = true;
                response.data.destroy();
                stream.destroy();
                reject(new Error(`تم تجاوز الحد المسموح ${MAX_MB}MB أثناء التنزيل`));
            }
        });

        response.data.on('error', reject);
        stream.on('error', reject);
        stream.on('finish', resolve);
        response.data.pipe(stream);
    });

    const size = fs.statSync(filePath).size;
    if (!size) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        throw new Error('الملف الناتج فارغ');
    }

    return { file: filePath, sizeMb: size / (1024 * 1024) };
}

/** تشغيل أمر خارجي وإرجاع stdout */
function run(command, args, timeout = 240000) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true });
        let out = '';
        let err = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('انتهت المدة المسموحة للعملية'));
        }, timeout);

        child.stdout.on('data', d => { out += d.toString(); });
        child.stderr.on('data', d => { err += d.toString(); });
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', code => {
            clearTimeout(timer);
            if (code === 0) resolve(out);
            else reject(new Error((err || out || `فشل بكود ${code}`).trim().split('\n').pop()));
        });
    });
}

async function hasFfmpeg() {
    try {
        await run('ffmpeg', ['-version'], 15000);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * بعض المزودات ترجع فيديو بترميز AV1/VP9 والواتساب لا يشغّله على كل الأجهزة.
 * هذه الدالة تفحص الترميز وتحوّله إلى H.264/AAC عند الحاجة فقط.
 */
async function ensurePlayable(filePath) {
    if (!/\.(mp4|mkv|webm|mov)$/i.test(filePath)) return filePath;
    if (!(await hasFfmpeg())) return filePath;

    let codecs = '';
    try {
        codecs = await run('ffprobe', [
            '-v', 'error', '-show_entries', 'stream=codec_name',
            '-of', 'csv=p=0', filePath
        ], 30000);
    } catch (_) {
        return filePath;
    }

    const list = codecs.split(/\s+/).filter(Boolean).map(x => x.trim().toLowerCase());
    const needsWork = list.some(codec => ['av1', 'vp9', 'vp8'].includes(codec));
    if (!needsWork) return filePath;

    const target = filePath.replace(/\.[^.]+$/, '') + '_h264.mp4';
    logger.info('جاري تحويل الفيديو إلى ترميز متوافق مع الواتساب...');

    try {
        await run('ffmpeg', [
            '-v', 'error', '-y', '-i', filePath,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-c:a', 'aac', '-b:a', '128k',
            target
        ], 420000);
    } catch (error) {
        logger.warn(`تعذر تحويل الترميز: ${error.message}`);
        return filePath;
    }

    if (!fs.existsSync(target) || !fs.statSync(target).size) return filePath;
    try { fs.unlinkSync(filePath); } catch (_) {}
    return target;
}

/* ──────────────────── مزود يوتيوب: saveVid ──────────────────── */

/** الخطوة الأولى: بيانات الفيديو + مفتاح التحويل */
async function youtubeMeta(url) {
    const response = await http.get(`${EMAM}/Download/api/saveVid/youtube`, { params: { url } });
    const data = response.data?.data;
    if (!response.data?.status || !data?.key) {
        throw new Error(response.data?.message || 'لم يرد المزود ببيانات الفيديو');
    }
    return {
        id: data.id,
        title: data.title || 'فيديو',
        duration: Number(data.duration) || 0,
        thumbnail: data.thumbnail || '',
        key: data.key,
        qualities: Array.isArray(data.available_qualities) ? data.available_qualities.map(String) : []
    };
}

/** الخطوة الثانية: رابط التحميل النهائي لجودة محددة */
async function youtubeLink(meta, quality) {
    const response = await http.get(`${EMAM}/Download/api/saveVid/youtube`, {
        params: { id: meta.id, quality, key: meta.key }
    });
    const link = response.data?.data?.download_url;
    if (!response.data?.status || !link) {
        throw new Error(response.data?.message || `تعذر الحصول على رابط الجودة ${quality}`);
    }
    return link;
}

/** يوتيوب صوت mp3 عبر ymcdn (مزود مستقل، رابط مباشر) */
async function youtubeAudioYmcdn(url) {
    const response = await http.get(`${EMAM}/Download/api/Youtube/ymcdn`, { params: { url } });
    const data = response.data?.data;
    if (!response.data?.status || !data?.url) {
        throw new Error(response.data?.error || response.data?.message || 'فشل مزود الصوت');
    }
    return { url: data.url, title: data.title || 'صوت' };
}

/**
 * تحميل يوتيوب عبر المزودات الخارجية.
 * @param {string} url رابط أو معرّف الفيديو
 * @param {'video'|'audio'} mode
 * @param {string} tempDir
 */
async function youtubeDownload(url, mode, tempDir) {
    const id = youtubeId(url);
    const canonical = id ? `https://www.youtube.com/watch?v=${id}` : url;
    const wantAudio = mode === 'audio';

    let meta = null;
    const errors = [];

    try {
        meta = await youtubeMeta(canonical);
    } catch (error) {
        errors.push(`saveVid: ${error.message}`);
    }

    /* المسار الأول: saveVid — يدعم الصوت والفيديو بجودات متعددة */
    if (meta) {
        const order = wantAudio
            ? ['mp3']
            : ['720', '480', '360', '1080', '240', '144'];
        const available = order.filter(q => !meta.qualities.length || meta.qualities.includes(q));
        const attempts = available.length ? available : order;

        for (const quality of attempts) {
            try {
                const link = await youtubeLink(meta, quality);
                const extension = quality === 'mp3' ? 'mp3' : 'mp4';
                const target = path.join(tempDir, `${safeName(meta.title)}_${Date.now()}.${extension}`);
                const saved = await fetchToFile(link, target);
                const finalFile = wantAudio ? saved.file : await ensurePlayable(saved.file);
                const size = fs.statSync(finalFile).size / (1024 * 1024);

                logger.success(`تم التحميل عبر المزود الخارجي (${quality})`);
                return {
                    file: finalFile,
                    sizeMb: size,
                    all: [finalFile],
                    provider: `saveVid:${quality}`,
                    info: {
                        title: meta.title,
                        uploader: '',
                        duration: meta.duration,
                        thumbnail: meta.thumbnail,
                        views: 0,
                        webpage: canonical
                    }
                };
            } catch (error) {
                errors.push(`saveVid ${quality}: ${error.message}`);
            }
        }
    }

    /* المسار الثاني: ymcdn — صوت mp3 فقط */
    if (wantAudio) {
        try {
            const audio = await youtubeAudioYmcdn(canonical);
            const target = path.join(tempDir, `${safeName(audio.title)}_${Date.now()}.mp3`);
            const saved = await fetchToFile(audio.url, target);
            logger.success('تم تحميل الصوت عبر مزود ymcdn');
            return {
                file: saved.file,
                sizeMb: saved.sizeMb,
                all: [saved.file],
                provider: 'ymcdn',
                info: {
                    title: audio.title,
                    uploader: '',
                    duration: meta?.duration || 0,
                    thumbnail: meta?.thumbnail || '',
                    views: 0,
                    webpage: canonical
                }
            };
        } catch (error) {
            errors.push(`ymcdn: ${error.message}`);
        }
    }

    throw new Error(`فشل كل مزودات يوتيوب — ${errors.slice(0, 3).join(' | ')}`);
}

/* ─────────── مزود عام: تيك توك / فيسبوك / تويتر / غيرها ─────────── */

/** استعلام المزود العام وإرجاع النتيجة موحّدة */
async function universalInfo(url) {
    const response = await http.get(`${EMAM}/Download/api/api/download`, { params: { url } });
    const data = response.data;
    if (!data?.success || !Array.isArray(data.medias) || !data.medias.length) {
        throw new Error(data?.message || 'لم يجد المزود أي وسائط');
    }

    return {
        source: data.source || '',
        title: data.title || 'ملف',
        author: data.author || data.unique_id || '',
        thumbnail: data.thumbnail || '',
        duration: Number(data.duration) || 0,
        views: Number(data.statistics?.playCount || data.statistics?.views || 0) || 0,
        webpage: data.url || url,
        medias: data.medias.map(item => ({
            url: item.url,
            type: item.type || 'video',
            extension: item.extension || item.ext || 'mp4',
            quality: String(item.quality || item.label || ''),
            formatId: item.formatId != null ? String(item.formatId) : ''
        }))
    };
}

/** اختيار أفضل صيغة صالحة للتحميل المباشر */
function pickMedia(medias, mode) {
    const wantAudio = mode === 'audio';
    // روابط googlevideo مقيّدة بعنوان IP السيرفر → غير قابلة للتحميل من عندنا
    const usable = medias.filter(item => !/googlevideo\.com|redirector\.googlevideo/i.test(item.url));
    const pool = usable.length ? usable : medias;

    if (wantAudio) {
        const audio = pool.find(item => item.type === 'audio' || /mp3|m4a|audio/i.test(`${item.extension} ${item.quality}`));
        if (audio) return audio;
    }

    const preference = [
        /hd_no_watermark/i, /no_watermark/i, /^hd$/i, /1080/, /720/, /^sd$/i, /480/, /360/
    ];
    for (const rule of preference) {
        const hit = pool.find(item => item.type !== 'audio' && rule.test(item.quality));
        if (hit) return hit;
    }
    return pool.find(item => item.type !== 'audio') || pool[0];
}

/** تحميل عام عبر المزود الخارجي */
async function universalDownload(url, mode, tempDir) {
    const info = await universalInfo(url);
    const media = pickMedia(info.medias, mode);
    if (!media?.url) throw new Error('لا توجد صيغة صالحة للتحميل');

    const isAudio = media.type === 'audio' || /mp3|m4a/i.test(media.extension);
    const extension = isAudio ? 'mp3' : (/(mp4|webm|mkv|jpg|jpeg|png)$/i.test(media.extension) ? media.extension : 'mp4');
    const target = path.join(tempDir, `${safeName(info.title)}_${Date.now()}.${extension}`);

    const saved = await fetchToFile(media.url, target, info.webpage);
    const finalFile = isAudio ? saved.file : await ensurePlayable(saved.file);
    const size = fs.statSync(finalFile).size / (1024 * 1024);

    logger.success(`تم التحميل عبر المزود العام (${info.source || 'عام'} / ${media.quality || 'افتراضي'})`);

    return {
        file: finalFile,
        sizeMb: size,
        all: [finalFile],
        provider: `universal:${info.source || 'generic'}`,
        info: {
            title: info.title,
            uploader: info.author,
            duration: info.duration,
            thumbnail: info.thumbnail,
            views: info.views,
            webpage: info.webpage
        }
    };
}

/* ───────────────────── بحث صور بينترست ───────────────────── */

async function pinterestImages(query, limit = 8) {
    const response = await http.get(`${EMAM}/Search/api/api/pinterest/image`, { params: { q: query } });
    const items = response.data?.data;
    if (!response.data?.status || !Array.isArray(items) || !items.length) {
        throw new Error('لا نتائج من مزود بينترست');
    }
    return items
        .filter(item => item?.url)
        .slice(0, limit)
        .map(item => ({
            url: item.url,
            title: item.title && item.title !== 'No title' ? item.title : '',
            owner: item.owner || '',
            page: item.pinUrl || ''
        }));
}

module.exports = {
    fetchToFile,
    ensurePlayable,
    hasFfmpeg,
    youtubeId,
    youtubeMeta,
    youtubeDownload,
    youtubeAudioYmcdn,
    universalInfo,
    universalDownload,
    pinterestImages,
    safeName
};
