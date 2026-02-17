import fs from "fs";
import os from "os";
import process from "process";
import v8 from "v8";
import path from "path";
import { monitorEventLoopDelay } from "perf_hooks";

/* ======================================================
   CONFIG
====================================================== */

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "crash_log.log");

/* ======================================================
   INIT LOG FILE SAFELY
====================================================== */

function ensureLogFile() {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }

        if (!fs.existsSync(LOG_FILE)) {
            fs.writeFileSync(LOG_FILE, "");
        }
    } catch (err) {
        console.error("❌ Failed to initialize log file", err);
    }
}

ensureLogFile();

/* ======================================================
   LOGGER (CRASH SAFE)
====================================================== */

function log(level: string, message: string, extra: any = {}) {
    try {
        const payload = {
            time: new Date().toISOString(),
            pid: process.pid,
            level,
            message,
            extra,
        };

        fs.appendFileSync(LOG_FILE, JSON.stringify(payload) + "\n");
    } catch (err) {
        console.error("❌ Logging failed", err);
    }
}

/* ======================================================
   SYSTEM SNAPSHOT
====================================================== */

function systemSnapshot(reason: string) {
    log("SNAPSHOT", reason, {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        load: os.loadavg(),
        uptime: process.uptime(),
        heap: v8.getHeapStatistics(),
        activeHandles: (process as any)._getActiveHandles?.()?.length,
        activeRequests: (process as any)._getActiveRequests?.()?.length,
    });
}

/* ======================================================
   EVENT LOOP WATCHDOG
====================================================== */

const loopMonitor = monitorEventLoopDelay({ resolution: 20 });
loopMonitor.enable();

setInterval(() => {
    const lagMs = loopMonitor.mean / 1e6;

    if (lagMs > 2000) {
        systemSnapshot("EVENT_LOOP_BLOCKED");
    }
}, 5000);

/* ======================================================
   MEMORY WATCHDOG
====================================================== */

setInterval(() => {
    const rssMB = process.memoryUsage().rss / 1024 / 1024;

    if (rssMB > 800) {
        systemSnapshot("HIGH_MEMORY_PRESSURE");
    }
}, 3000);

/* ======================================================
   GLOBAL ERROR TRAPS
====================================================== */

process.on("uncaughtException", (err) => {
    systemSnapshot("UNCAUGHT_EXCEPTION");
    log("FATAL", err.stack || String(err));
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    systemSnapshot("UNHANDLED_REJECTION");
    log("ERROR", String(reason));
});

/* ======================================================
   SIGNAL TRAPS (PM2 / OS KILLS)
====================================================== */

["SIGTERM", "SIGINT", "SIGABRT"].forEach((sig) => {
    process.on(sig as NodeJS.Signals, () => {
        systemSnapshot(`SIGNAL_${sig}`);
        process.exit(0);
    });
});

/* ======================================================
   HEARTBEAT (LIVENESS)
====================================================== */

setInterval(() => {
    log("HEARTBEAT", "process alive");
}, 10000);

/* ======================================================
   STARTUP MARKER
====================================================== */

log("INFO", "Crash Guardian initialized successfully");
