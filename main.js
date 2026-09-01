const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const { mkdir } = require('fs/promises');
const pino = require('pino');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline');
const { exec } = require('child_process');
const logger = require('./utils/console');
const config = require('./config');
const { applyBranding } = require('./utils/branding');
const devGroup = require('./utils/devGroup');
const statusWatcher = require('./utils/status');

const databasePath = path.join(__dirname, 'data', 'database.json');
function loadDatabase() {
    try {
        if (!fs.existsSync(databasePath)) return { users: {}, groups: {} };
        const data = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
        return {
            users: data?.users && typeof data.users === 'object' ? data.users : {},
            groups: data?.groups && typeof data.groups === 'object' ? data.groups : {}
        };
    } catch (error) {
        logger.warn(`تعذر تحميل قاعدة بيانات البوت: ${error.message}`);
        return { users: {}, groups: {} };
    }
}

function saveDatabase() {
    try {
        fs.mkdirSync(path.dirname(databasePath), { recursive: true });
        const temporaryPath = `${databasePath}.tmp`;
        fs.writeFileSync(temporaryPath, JSON.stringify(global.db, null, 2));
        fs.renameSync(temporaryPath, databasePath);
    } catch (error) {
        logger.warn(`تعذر حفظ قاعدة بيانات البوت: ${error.message}`);
    }
}

global.db = loadDatabase();
const databaseInterval = setInterval(saveDatabase, 30000);
databaseInterval.unref();

const question = text => new Promise(resolve => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question(text, answer => {
        rl.close();
        resolve(answer);
    });
});

const asciiArt = `
${chalk.hex('#FFD700')('██████╗  ███████╗ ██╗   ██╗  ██████╗  ███╗   ██╗ ██╗  ██████╗ ')}
${chalk.hex('#FFD700')('██╔══██╗ ██╔════╝ ██║   ██║ ██╔═══██╗ ████╗  ██║ ██║ ██╔════╝ ')}
${chalk.hex('#FFD700')('██║  ██║ █████╗   ██║   ██║ ██║   ██║ ██╔██╗ ██║ ██║ ██║      ')}
${chalk.hex('#FFD700')('██║  ██║ ██╔══╝   ╚██╗ ██╔╝ ██║   ██║ ██║╚██╗██║ ██║ ██║      ')}
${chalk.hex('#FFD700')('██████╔╝ ███████╗  ╚████╔╝  ╚██████╔╝ ██║ ╚████║ ██║ ╚██████╗ ')}
${chalk.hex('#FFD700')('╚═════╝  ╚══════╝   ╚═══╝    ╚═════╝  ╚═╝  ╚═══╝ ╚═╝  ╚═════╝ ')}
`;

function playSound(name) {
    const controlPath = path.join(__dirname, 'sounds', 'sound.txt');
    const status = fs.existsSync(controlPath) ? fs.readFileSync(controlPath, 'utf-8').trim() : 'off';
    if (status !== '{on}') return;
    const filePath = path.join(__dirname, 'sounds', name);
    if (fs.existsSync(filePath)) exec(`mpv --no-terminal --really-quiet "${filePath}"`);
}

async function startBot() {
    try {
        console.clear();
        console.log(asciiArt);
        console.log(chalk.hex('#FFD700').bold(`\nWELCOME TO ${config.botName}\n`));
        console.log(chalk.hex('#FFD700')(`  القناة  : ${config.channel.link}`));
        console.log(chalk.hex('#FFD700')(`  الجروب  : ${config.devGroup.invite}`));
        console.log(chalk.hex('#FFD700')(`  الإصدار : ${config.version}\n`));

        playSound('DEVONIC.mp3');

        // index.js passes the session directory explicitly. Keeping this
        // configurable prevents accidental creation of a second session.
        const sessionDir = process.env.CONNECTION_FOLDER ||
            path.join(__dirname, 'ملف_الاتصال');
        await mkdir(sessionDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['MacOs', 'Chrome', '1.0.0'],
            logger: pino({ level: 'silent' }),
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false
        });

        // كل رسالة يرسلها البوت تظهر كمعاد توجيهها من قناة البوت الرسمية
        applyBranding(sock);

        sock.ev.on('groups.upsert', async (groups) => {
            for (const group of groups) {
                try {
                    await sock.groupMetadata(group.id);
                    console.log(`[+] تم تحميل بيانات مجموعة: ${group.subject}`);
                } catch (err) {
                    console.warn(`[-] فشل في تحميل بيانات مجموعة: ${group.id}`);
                }
            }
        });

        if (!sock.authState.creds.registered) {
            console.log(chalk.bold('\n[ SETUP ] Please enter your phone number to receive the pairing code:'));
            console.log(chalk.dim('          (Type "#" to cancel)\n'));

            let phoneNumber = await question(chalk.bgHex('#FFD700').black(' Phone Number : '));
            if (phoneNumber.trim() === '#') process.exit();

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            if (!phoneNumber.match(/^\d{10,15}$/)) {
                console.log("\n[ ERROR ] Invalid phone number.\n");
                process.exit(1);
            }

            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log('\n────────── Pairing Information ──────────');
                console.log(`Pairing Code: ${code}`);
                console.log(`Phone Number: ${phoneNumber}`);
                console.log('─────────────────────────────────────────\n');
            } catch (error) {
                console.log("\n[ ERROR ] Failed to get pairing code.\n");
                process.exit(1);
            }
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting') {
                logger.info('Connecting to WhatsApp...');
            }

            if (connection === 'open') {
                logger.success(`CONNECTED! USER ID: ${sock.user.id}`);

                try {
                    const { addEliteNumber } = require('./haykala/elite');
                    const botNumber = sock.user.id.split(':')[0].replace(/[^0-9]/g, '');
                    const jid = `${botNumber}@s.whatsapp.net`;

                    await addEliteNumber(botNumber);   // رقم الجلسة

                    // ملاحظة: كان هنا return يوقف باقي التهيئة إن فشل onWhatsApp
                    const [info] = await sock.onWhatsApp(jid).catch(() => []);
                    if (info?.lid) {
                        const lidNumber = info.lid.replace(/[^0-9]/g, '');
                        await addEliteNumber(lidNumber);
                        logger.info(`ADDED ${botNumber} AND ${lidNumber} TO ELITE!`);
                    } else {
                        logger.warn('تعذر الحصول على الـ LID — تم المتابعة بالرقم الأساسي فقط');
                    }
                } catch (e) {
                    logger.error('فشل في إضافة رقم الجلسة إلى النخبة:', e.message);
                }

                /* شرط جروب المطور: البوت لا يعمل إلا إذا كان رقمه عضواً فيه */
                try {
                    await devGroup.verify(sock);
                    devGroup.watch(sock);
                } catch (error) {
                    logger.error(`فشل التحقق من جروب المطور: ${error.message}`);
                }

                /* مشاهدة الاستوريهات والتفاعل بقلب (كخط دفاع ثانٍ مع المعالج) */
                statusWatcher.attach(sock);

                require('./handlers/handler').handleMessagesLoader();
                listenToConsole(sock);
            }

            if (connection === 'close') {
                const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
                logger.warn(`Disconnected: ${lastDisconnect?.error?.message || 'Unknown reason'}`);

                if (isLoggedOut) {
                    playSound('LOGGOUT.mp3');
                    logger.error('You have been logged out.');
                    process.exit(1);
                } else {
                    logger.info('Reconnecting...');
                    scheduleRestart(3000);
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const { handleMessages } = require('./handlers/handler');
                await handleMessages(sock, m);
            } catch (err) {
                logger.error('Error while handling message:', err);
                playSound('ERROR.mp3');
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (err) {
        logger.error('Startup error:', err);
        playSound('ERROR.mp3');
        scheduleRestart(3000);
    }
}

let restartTimer = null;
function scheduleRestart(delay) {
    if (restartTimer) return;
    restartTimer = setTimeout(() => {
        restartTimer = null;
        startBot().catch(error => logger.error('Restart error:', error));
    }, delay);
}

function listenToConsole(sock) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', (line) => {
        console.log('[ CMD ] Unknown command.');
    });
}

process.once('SIGINT', () => {
    clearInterval(databaseInterval);
    saveDatabase();
    process.exit(0);
});

process.once('SIGTERM', () => {
    clearInterval(databaseInterval);
    saveDatabase();
    process.exit(0);
});

startBot().catch(error => logger.error('Fatal startup error:', error));
