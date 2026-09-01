/**
 * مُشغِّل yt-dlp — 𝐃𝐄𝐕𝐎𝐍𝐈𝐂 𝐁𝐎𝐓 ⚚
 *
 * هذه هي النواة الموثوقة لكل عمليات التحميل والبحث، لأنها لا تعتمد على
 * أي API خارجي قد يتوقف. تدعم: يوتيوب، تيك توك، إنستغرام، فيسبوك،
 * تويتر/X، سناب، بينترست، ساوندكلاود وغيرها.
 *
 * إذا لم يكن yt-dlp مثبتاً على الجهاز يتم تنزيله تلقائياً إلى مجلد bin/.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn, execFile } = require('child_process');
const config = require('../config');
const logger = require('./console');

const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');

let cachedBinary = null;
let installPromise = null;

/* ────────────────────── إيجاد النسخة المثبتة ────────────────────── */

function tryExec(command, args = ['--version']) {
    return new Promise(resolve => {
        execFile(command, args, { timeout: 20000 }, error => resolve(!error));
    });
}

function localBinaryName() {
    if (process.platform === 'win32') return 'yt-dlp.exe';
    return 'yt-dlp';
}

function assetName() {
    if (process.platform === 'win32') return 'yt-dlp.exe';
    if (process.platform === 'darwin') return 'yt-dlp_macos';
    return os.arch() === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
}

function download(url, destination, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 6) return reject(new Error('عدد كبير من التحويلات'));
        https.get(url, { headers: { 'User-Agent': 'devonic-bot' } }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();
                return resolve(download(response.headers.location, destination, redirects + 1));
            }
            if (response.statusCode !== 200) {
                response.resume();
                return reject(new Error(`HTTP ${response.statusCode}`));
            }
            const file = fs.createWriteStream(destination);
            response.pipe(file);
            file.on('finish', () => file.close(() => resolve(destination)));
            file.on('error', reject);
        }).on('error', reject);
    });
}

async function installBinary() {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    const target = path.join(BIN_DIR, localBinaryName());
    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName()}`;

    logger.info('⬇️ جاري تنزيل yt-dlp لأول مرة، انتظر لحظات...');
    await download(url, target);
    if (process.platform !== 'win32') fs.chmodSync(target, 0o755);

    if (!(await tryExec(target))) throw new Error('النسخة المنزّلة من yt-dlp لا تعمل');
    logger.success('✅ تم تثبيت yt-dlp بنجاح');
    return target;
}

/** إرجاع مسار yt-dlp القابل للتنفيذ (مع تثبيته تلقائياً إذا لزم) */
async function resolveBinary() {
    if (cachedBinary) return cachedBinary;

    const candidates = [
        process.env.YTDLP_PATH,
        path.join(BIN_DIR, localBinaryName()),
        'yt-dlp',
        'yt-dlp.exe',
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (await tryExec(candidate)) {
            cachedBinary = candidate;
            return cachedBinary;
        }
    }

    if (!config.media?.ytdlpAutoInstall) {
        throw new Error('yt-dlp غير مثبت. ثبّته أو فعّل media.ytdlpAutoInstall في config.js');
    }

    if (!installPromise) {
        installPromise = installBinary()
            .then(binary => {
                cachedBinary = binary;
                return binary;
            })
            .catch(error => {
                installPromise = null;
                throw error;
            });
    }
    return installPromise;
}

/* ────────────────────── التشغيل ────────────────────── */

function run(args, { timeout } = {}) {
    return new Promise(async (resolve, reject) => {
        let binary;
        try {
            binary = await resolveBinary();
        } catch (error) {
            return reject(error);
        }

        const child = spawn(binary, args, { windowsHide: true });
        let stdout = '';
        let stderr = '';
        let finished = false;

        const timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            child.kill('SIGKILL');
            reject(new Error('انتهت المهلة الزمنية للتحميل'));
        }, timeout || config.media?.requestTimeoutMs || 120000);

        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });

        child.on('error', error => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            reject(error);
        });

        child.on('close', code => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (code === 0) return resolve({ stdout, stderr });
            const reason = (stderr.split('\n').filter(Boolean).pop() || `رمز الخروج ${code}`).trim();
            reject(new Error(reason));
        });
    });
}

const BASE_ARGS = [
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificates',
    '--ignore-config',
    '--geo-bypass',
    '--retries', '3',
    '--socket-timeout', '20'
];

/** جلب بيانات الرابط بصيغة JSON */
async function getInfo(url, extraArgs = []) {
    const { stdout } = await run([...BASE_ARGS, '-J', ...extraArgs, url]);
    const line = stdout.split('\n').find(item => item.trim().startsWith('{'));
    if (!line) throw new Error('تعذر قراءة بيانات الرابط');
    return JSON.parse(line);
}

/** بحث يوتيوب (سريع، بدون API خارجي) */
async function search(query, limit = 8) {
    const { stdout } = await run([
        ...BASE_ARGS,
        '-J',
        '--flat-playlist',
        `ytsearch${limit}:${query}`
    ], { timeout: 90000 });

    const line = stdout.split('\n').find(item => item.trim().startsWith('{'));
    if (!line) return [];
    const data = JSON.parse(line);

    return (data.entries || []).filter(Boolean).map(entry => ({
        id: entry.id,
        title: entry.title || 'بدون عنوان',
        url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
        duration: entry.duration || 0,
        durationText: formatDuration(entry.duration),
        channel: entry.uploader || entry.channel || '',
        views: entry.view_count || 0,
        thumbnail:
            entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
            `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`
    }));
}

function formatDuration(seconds) {
    const total = Number(seconds) || 0;
    if (!total) return 'غير معروف';
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    const pad = value => String(value).padStart(2, '0');
    return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * تحميل ملف فعلي إلى القرص.
 * @param {string} url
 * @param {'video'|'audio'} mode
 * @param {string} outputDir
 */
async function downloadMedia(url, mode, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const template = path.join(outputDir, `${stamp}.%(ext)s`);
    const maxMb = Number(config.media?.maxFileSizeMb) || 90;

    const args = [...BASE_ARGS, '-o', template, '--no-progress'];

    if (mode === 'audio') {
        args.push('-f', 'bestaudio[ext=m4a]/bestaudio/best');
        args.push('-x', '--audio-format', 'mp3', '--audio-quality', '5');
    } else {
        args.push(
            '-f',
            `best[filesize<${maxMb}M][ext=mp4]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/best[ext=mp4]/best`,
            '--merge-output-format', 'mp4'
        );
    }

    args.push(url);
    await run(args, { timeout: config.media?.requestTimeoutMs });

    const files = fs.readdirSync(outputDir)
        .filter(name => name.startsWith(stamp))
        .map(name => path.join(outputDir, name))
        .filter(file => fs.statSync(file).isFile());

    if (!files.length) throw new Error('لم يتم إنشاء أي ملف بعد التحميل');

    // نختار أكبر ملف صالح (يستبعد ملفات .part المؤقتة)
    const finalFile = files
        .filter(file => !file.endsWith('.part'))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] || files[0];

    const sizeMb = fs.statSync(finalFile).size / (1024 * 1024);
    if (sizeMb > maxMb) {
        files.forEach(file => fs.promises.unlink(file).catch(() => {}));
        throw new Error(`حجم الملف ${sizeMb.toFixed(1)}MB أكبر من الحد المسموح (${maxMb}MB)`);
    }

    return { file: finalFile, sizeMb, all: files };
}

/** جلب رابط مباشر بدون تنزيل (أسرع، مفيد للفيديوهات الكبيرة) */
async function getDirectUrl(url, mode) {
    const format = mode === 'audio'
        ? 'bestaudio[ext=m4a]/bestaudio/best'
        : 'best[ext=mp4]/best';
    const { stdout } = await run([...BASE_ARGS, '-f', format, '-g', url], { timeout: 60000 });
    const links = stdout.split('\n').map(line => line.trim()).filter(line => line.startsWith('http'));
    if (!links.length) throw new Error('تعذر استخراج الرابط المباشر');
    return links[0];
}

module.exports = {
    resolveBinary,
    run,
    getInfo,
    search,
    downloadMedia,
    getDirectUrl,
    formatDuration,
    BIN_DIR
};
