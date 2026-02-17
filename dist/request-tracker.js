import fs from "fs";
export function trackRequest(req, res, next) {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (duration > 5000) {
            fs.appendFileSync("logs/slow-requests.log", JSON.stringify({
                time: new Date().toISOString(),
                method: req.method,
                url: req.originalUrl,
                duration,
            }) + "\n");
        }
    });
    next();
}
//# sourceMappingURL=request-tracker.js.map