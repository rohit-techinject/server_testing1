import type { Request, Response, NextFunction } from "express";
import fs from "fs";

// Storage for currently ongoing requests
const activeRequests = new Map<string, {
    method: string;
    url: string;
    startTime: string;
    ip: string;
}>();

export function trackRequest(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const requestId = `${req.method}:${req.originalUrl}:${start}:${Math.random().toString(36).slice(2, 9)}`;

    // Register active request
    activeRequests.set(requestId, {
        method: req.method,
        url: req.originalUrl,
        startTime: new Date(start).toISOString(),
        ip: req.ip || "unknown"
    });

    res.on("finish", () => {
        const duration = Date.now() - start;

        // Remove from active requests
        activeRequests.delete(requestId);

        if (duration > 5000) {
            fs.appendFileSync(
                "logs/slow-requests.log",
                JSON.stringify({
                    time: new Date().toISOString(),
                    method: req.method,
                    url: req.originalUrl,
                    duration,
                }) + "\n"
            );
        }
    });

    // Handle closed connections without finish (e.g., client abort)
    res.on("close", () => {
        activeRequests.delete(requestId);
    });

    next();
}

/**
 * Returns an array of currently active requests
 */
export function getActiveRequests() {
    return Array.from(activeRequests.values());
}

