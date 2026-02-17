import fs from "fs";
import os from "os";
import process from "process";
import v8 from "v8";
import path from "path";
import { monitorEventLoopDelay } from "perf_hooks";

// Import request tracker to see active work during crash
import { getActiveRequests } from "./request-tracker.js";

/* ======================================================
   CONFIG
====================================================== */


const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "crash_log.log");
const MARKER_FILE = path.join(LOG_DIR, "last_exit.json");

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

        const logLine = JSON.stringify(payload) + "\n";
        fs.appendFileSync(LOG_FILE, logLine);

        // Also log to console for visibility in PM2/Logs
        if (level === "ERROR" || level === "FATAL" || level === "SNAPSHOT") {
            console.error(`[${level}] ${message}`, extra);
        } else {
            console.log(`[${level}] ${message}`);
        }
    } catch (err) {
        console.error("❌ Logging failed", err);
    }
}

/* ======================================================
   SYSTEM SNAPSHOT
====================================================== */

function getSystemStats() {
    return {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        load: os.loadavg(),
        uptime: process.uptime(),
        heap: v8.getHeapStatistics(),
        activeHandles: (process as any)._getActiveHandles?.()?.length,
        activeRequests: (process as any)._getActiveRequests?.()?.length,
        ongoingApiCalls: getActiveRequests() // <-- ADDED THIS
    };
}


function systemSnapshot(reason: string, subMessage?: string) {
    log("SNAPSHOT", reason, {
        ...(subMessage ? { detail: subMessage } : {}),
        stats: getSystemStats()
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
        systemSnapshot("EVENT_LOOP_BLOCKED", `Mean lag: ${lagMs.toFixed(2)}ms`);
    }
}, 5000);

/* ======================================================
   MEMORY WATCHDOG
====================================================== */

setInterval(() => {
    const mem = process.memoryUsage();
    const rssMB = mem.rss / 1024 / 1024;
    const heapUsedMB = mem.heapUsed / 1024 / 1024;

    if (rssMB > 800) {
        systemSnapshot("HIGH_MEMORY_PRESSURE", `RSS: ${rssMB.toFixed(2)}MB, HeapUsed: ${heapUsedMB.toFixed(2)}MB`);
    }
}, 3000);

/* ======================================================
   DEATH NOTE (POST-MORTEM PREPARATION)
====================================================== */

function writeDeathNote(reason: string, error?: any) {
    const deathNote = {
        time: new Date().toISOString(),
        pid: process.pid,
        reason,
        error: error ? (error.stack || String(error)) : null,
        stats: getSystemStats()
    };
    try {
        fs.writeFileSync(MARKER_FILE, JSON.stringify(deathNote, null, 2));
        log("INFO", `Death note written: ${reason}`);
    } catch (err) {
        console.error("❌ Failed to write death note", err);
    }
}

/* ======================================================
   GLOBAL ERROR TRAPS
====================================================== */

process.on("uncaughtException", (err) => {
    writeDeathNote("UNCAUGHT_EXCEPTION", err);
    systemSnapshot("UNCAUGHT_EXCEPTION");
    log("FATAL", err.stack || String(err));
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    systemSnapshot("UNHANDLED_REJECTION", String(reason));
    log("ERROR", `Unhandled Rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});

/* ======================================================
   SIGNAL TRAPS (PM2 / OS KILLS)
====================================================== */

["SIGTERM", "SIGINT", "SIGABRT"].forEach((sig) => {
    process.on(sig as NodeJS.Signals, () => {
        writeDeathNote(`SIGNAL_${sig}`);
        systemSnapshot(`SIGNAL_${sig}`);
        // Clean exit marker if it was a manual/planned stop
        if (fs.existsSync(MARKER_FILE)) {
            // We keep it to analyze why it was stopped, but maybe mark as "GRACEFUL"
        }
        process.exit(0);
    });
});

process.on("exit", (code) => {
    log("INFO", `Process exiting with code: ${code}`);
});

/* ======================================================
   POST-MORTEM CHECK (STARTUP)
====================================================== */

function checkPostMortem() {
    if (fs.existsSync(MARKER_FILE)) {
        try {
            const lastExit = JSON.parse(fs.readFileSync(MARKER_FILE, "utf-8"));
            log("ALERT", "POST-MORTEM ANALYSIS: Previous process did not exit cleanly or was signaled.", lastExit);
            // Optionally move to a history file instead of just deleting
            const historyFile = path.join(LOG_DIR, `crash_history_${Date.now()}.json`);
            fs.renameSync(MARKER_FILE, historyFile);
        } catch (err) {
            console.error("❌ Failed to read post-mortem marker", err);
        }
    }
}

/* ======================================================
   HEARTBEAT (LIVENESS)
====================================================== */

setInterval(() => {
    log("HEARTBEAT", "process alive", { uptime: process.uptime() });
}, 10000);

/* ======================================================
   STARTUP
====================================================== */

checkPostMortem();
log("INFO", "Crash Guardian v2 initialized successfully");

