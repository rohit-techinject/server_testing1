import fs from "fs";
import os from "os";

const LOG_FILE = "process-guard.log";
const LAG_FILE = "eventloop-lag.log";

function log(level: "INFO" | "WARN" | "ERROR", msg: string) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${msg}\n`;
    console.log(logLine.trim());
    fs.appendFileSync(LOG_FILE, logLine);
}

// OS Stats Heartbeat
setInterval(() => {
    const m = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();
    const loadAvg = os.loadavg();

    log("INFO",
        `STATS: uptime=${uptime.toFixed(1)}s loadavg=${(loadAvg[0] ?? 0).toFixed(2)} ` +
        `MEM: rss=${(m.rss / 1024 / 1024).toFixed(1)}MB heap=${(m.heapUsed / 1024 / 1024).toFixed(1)}MB ` +
        `CPU: user=${(cpu.user / 1000).toFixed(0)}ms system=${(cpu.system / 1000).toFixed(0)}ms`
    );
}, 10000);

// Crash Detection
process.on("uncaughtException", (err) => {
    log("ERROR", "UNCAUGHT_EXCEPTION: " + (err?.stack || err));
    process.exit(1); // Standard practice to exit on uncaught exception
});

process.on("unhandledRejection", (reason: any) => {
    const errorMsg = reason instanceof Error ? reason.stack : String(reason);
    log("ERROR", "UNHANDLED_REJECTION: " + errorMsg);
});

process.on("SIGTERM", () => {
    log("INFO", "SIGTERM received. Shutting down gracefully.");
});

process.on("SIGINT", () => {
    log("INFO", "SIGINT received.");
});

process.on("exit", (code) => {
    log("INFO", `PROCESS EXIT code=${code}`);
});

// Event Loop Lag Monitoring
let last = Date.now();
setInterval(() => {
    const now = Date.now();
    const lag = now - last - 1000;

    if (lag > 200) {
        const timestamp = new Date().toISOString();
        const lagLine = `[${timestamp}] CRITICAL LAG DETECTED: ${lag}ms\n`;
        fs.appendFileSync(LAG_FILE, lagLine);
        log("WARN", `Event loop lag detected: ${lag}ms`);
    }

    last = now;
}, 1000);
