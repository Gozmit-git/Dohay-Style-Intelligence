import type { Request, Response, RequestHandler } from "express";
import { MvpError, validId } from "./mvpData";

export function input<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new MvpError(400, "Please check the required fields, file limits, and selected options."); }
}
export function param(req: Request, name: string): string {
  return validId(req.params[name]);
}
export function handler(fn: (req: Request, res: Response, userId: string) => Promise<void>): RequestHandler {
  return async (req, res): Promise<void> => {
    try {
      if (!req.userId) throw new MvpError(401, "Sign in to continue.");
      await fn(req, res, req.userId);
    } catch (error) {
      const status = error instanceof MvpError ? error.status : 500;
      req.log[status >= 500 ? "error" : "warn"]({ err: error }, "DOHAY request could not finish");
      if (!res.headersSent) res.status(status).json({
        error: error instanceof MvpError ? error.message : "DOHAY could not finish this request. Your saved data is unchanged; please retry.",
      });
    }
  };
}
