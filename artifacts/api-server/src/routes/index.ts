import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import wardrobeRouter from "./wardrobe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(wardrobeRouter);

export default router;
