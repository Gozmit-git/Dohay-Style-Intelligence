import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import chat from "./mvpChat";
import wardrobe from "./mvpWardrobe";
import outfits from "./mvpOutfits";

const router = Router();
router.use(requireAuth);
router.use(chat, wardrobe, outfits);
export default router;
