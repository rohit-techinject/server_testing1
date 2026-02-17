import type { Request, Response, NextFunction } from "express";
export declare function trackRequest(req: Request, res: Response, next: NextFunction): void;
/**
 * Returns an array of currently active requests
 */
export declare function getActiveRequests(): {
    method: string;
    url: string;
    startTime: string;
    ip: string;
}[];
//# sourceMappingURL=request-tracker.d.ts.map