import express from "express";
import {trackRequest} from "./request-tracker.js";
import "./crash-guardian.js"

const app = express();
const PORT = 4000;

function simulateCPULoad(durationSeconds: number) {
    console.log(`[STRESS] Starting CPU stress test for ${durationSeconds} seconds...`);
    const startTime = Date.now();
    const durationMs = durationSeconds * 1000;

    // This is a blocking loop - it will freeze the event loop
    while (Date.now() - startTime < durationMs) {
        // Do some math to keep the CPU busy
        Math.sqrt(Math.random() * Math.random());
    }

    console.log("[STRESS] CPU stress test completed.");
}


// ⚠️ DANGEROUS — TEST ONLY
function crashByMemoryLimit() {
    console.log("[TEST] REAL memory leak started...");

    const memoryHog: Buffer[] = [];

    setInterval(() => {
        // 30MB per second
        const size = 30 * 1024 * 1024;
        const buf = Buffer.allocUnsafe(size);

        // 🔥 TOUCH EVERY PAGE (force RAM commit)
        for (let i = 0; i < size; i += 4096) {
            buf[i] = 1;
        }

        memoryHog.push(buf);

        const mem = process.memoryUsage();
        console.log(
            `[MEMORY] RSS=${(mem.rss / 1024 / 1024).toFixed(1)}MB ` +
            `heap=${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB ` +
            `external=${(mem.external / 1024 / 1024).toFixed(1)}MB`
        );
    }, 1000);
}


// Health Endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Server is healthy",
        uptime: process.uptime(),
    });
});

function cpuHang() {
    console.log("CPU Hang started");

    while (true) {
        Math.sqrt(Math.random());
    }
}


app.use(trackRequest);

app.get("/crash-memory", (req, res) => {
    res.send("Memory leak started. Server will crash soon.");
    crashByMemoryLimit();
});



app.get("/crash", (req, res) => {
    console.log("[SERVER] Forced crash requested.");
    res.send("This call will crash the server! PM2 should restart it.");
    cpuHang();
});


// Stress Endpoint
app.get("/stress", (req, res) => {
    const duration = parseInt(req.query.duration as string) || 5;

    // We run this in the background (but it's blocking, so it WILL freeze the server for 'duration' seconds)
    // The user specifically asked for "CPU 100 percent use"
    res.json({ message: `Starting CPU stress for ${duration} seconds. Server will be unresponsive during this time.` });

    // Defer execution slightly to let the response be sent (if possible, though blocking code might prevent it if not careful)
    setTimeout(() => {
        simulateCPULoad(duration);
    }, 100);
});

app.listen(PORT, () => {
    console.log(`[SERVER] Express server running at http://localhost:${PORT}`);
    console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
    console.log(`[SERVER] Stress test: http://localhost:${PORT}/stress?duration=10`);
    console.log(`[SERVER] Crash test: http://localhost:${PORT}/crash`);
});

/**
 * BEST PRACTICE:
 * For tasks that use 100% CPU, Node.js becomes unresponsive because its single-threaded event loop is blocked.
 * To handle heavy tasks without blocking the server, use "Worker Threads".
 * Example:
 * const { Worker } = require('worker_threads');
 * const worker = new Worker('./cpu-task.js');
 */

