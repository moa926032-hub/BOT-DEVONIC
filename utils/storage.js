const fs = require('fs');
const path = require('path');

const MAX_STORAGE_BYTES = 6 * 1024 * 1024;
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const copyDir = path.join(projectRoot, 'tmp', 'copy-group');

const managedRoots = [dataDir, copyDir];
const managedFiles = [
    path.join(projectRoot, 'zarf.json'),
    path.join(projectRoot, 'image.jpeg'),
    path.join(projectRoot, 'sounds', 'AUDIO.mp3')
];

const preservedDataFiles = new Set(['bot.txt', 'mode.txt']);

function isInside(target, parent) {
    const relative = path.relative(parent, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isManagedPath(filePath) {
    const absolute = path.resolve(filePath);
    return managedFiles.some(file => absolute === path.resolve(file)) ||
        managedRoots.some(root => isInside(absolute, path.resolve(root)));
}

function getFileSize(filePath) {
    try {
        return fs.statSync(filePath).isFile() ? fs.statSync(filePath).size : 0;
    } catch {
        return 0;
    }
}

function walkDirectory(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDirectory(entryPath, files);
        } else if (entry.isFile()) {
            files.push(entryPath);
        }
    }

    return files;
}

function getStorageFiles() {
    const files = [];

    for (const root of managedRoots) {
        walkDirectory(root, files);
    }

    for (const file of managedFiles) {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            files.push(file);
        }
    }

    return [...new Set(files)];
}

function getStorageStats() {
    const files = getStorageFiles();
    const bytes = files.reduce((total, file) => total + getFileSize(file), 0);

    return {
        bytes,
        maxBytes: MAX_STORAGE_BYTES,
        remainingBytes: Math.max(0, MAX_STORAGE_BYTES - bytes),
        files: files.length,
        percentage: Math.round((bytes / MAX_STORAGE_BYTES) * 10000) / 100
    };
}

class StorageLimitError extends Error {
    constructor(stats, requestedBytes) {
        super(`Storage limit exceeded: ${stats.bytes + requestedBytes} > ${MAX_STORAGE_BYTES}`);
        this.name = 'StorageLimitError';
        this.code = 'STORAGE_LIMIT';
        this.stats = stats;
        this.requestedBytes = requestedBytes;
    }
}

function assertStorageAvailable(incomingBytes = 0, replacingFile = null) {
    const stats = getStorageStats();
    const oldBytes = replacingFile ? getFileSize(replacingFile) : 0;
    const projectedBytes = stats.bytes - oldBytes + incomingBytes;

    if (projectedBytes > MAX_STORAGE_BYTES) {
        throw new StorageLimitError(stats, Math.max(0, incomingBytes - oldBytes));
    }

    return stats;
}

function safeWriteFile(filePath, data, options = 'utf8') {
    const absolutePath = path.resolve(filePath);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), typeof options === 'string' ? options : 'utf8');

    if (isManagedPath(absolutePath)) {
        assertStorageAvailable(buffer.length, absolutePath);
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, data, options);
}

function removeContents(dir, preserve = () => false) {
    if (!fs.existsSync(dir)) return 0;
    let removed = 0;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (preserve(entry)) continue;
        const entryPath = path.join(dir, entry.name);
        fs.rmSync(entryPath, { recursive: true, force: true });
        removed++;
    }

    return removed;
}

function cleanStorage() {
    const removedDataEntries = removeContents(dataDir, entry =>
        entry.isFile() && preservedDataFiles.has(entry.name)
    );
    const removedCopies = removeContents(copyDir);

    return {
        removedEntries: removedDataEntries + removedCopies,
        stats: getStorageStats()
    };
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} بايت`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} كيلوبايت`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

module.exports = {
    MAX_STORAGE_BYTES,
    StorageLimitError,
    assertStorageAvailable,
    cleanStorage,
    formatBytes,
    getStorageStats,
    isManagedPath,
    safeWriteFile
};