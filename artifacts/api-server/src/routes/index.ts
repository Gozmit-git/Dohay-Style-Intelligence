import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import wardrobeRouter from "./wardrobe";
import mvpRouter from "./mvp";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(wardrobeRouter);
router.use("/v1", mvpRouter);
router.use("/billing", billingRouter);

export default router;
