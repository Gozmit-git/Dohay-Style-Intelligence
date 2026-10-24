import { Router } from "express";
import * as api from "@workspace/api-zod";
import { handler, input } from "../lib/mvpHttp";
import { MvpError } from "../lib/mvpData";
import { filterAccounts } from "../lib/ownerAccountModel";
import { getOwnerSnapshot } from "../lib/ownerAccounts";

export function ownerAdminRouter(authorize: (userId: string) => Promise<void>, snapshot = getOwnerSnapshot) {
  const router = Router();
  router.get("/access", handler(async (_req, res, userId) => {
    try { await authorize(userId); }
    catch (error) {
      if (error instanceof MvpError && error.status === 403) { res.json({ isOwner: false }); return; }
      throw error;
    }
    res.json({ isOwner: true });
  }));
  router.get("/summary", handler(async (_req, res, userId) => {
    await authorize(userId);
    const data = await snapshot();
    res.json(api.GetOwnerSummaryResponse.parse(data.summary));
  }));
  router.get("/accounts", handler(async (req, res, userId) => {
    await authorize(userId);
    const query = input(api.ListOwnerAccountsQueryParams, req.query);
    const data = await snapshot();
    res.json(api.ListOwnerAccountsResponse.parse({ ...filterAccounts(data.accounts, query), asOf: data.asOf }));
  }));
  return router;
}
