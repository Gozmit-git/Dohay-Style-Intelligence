import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import wardrobeRouter from "./wardrobe";
import mvpRouter from "./mvp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(wardrobeRouter);
router.use("/v1", mvpRouter);

export default router;
