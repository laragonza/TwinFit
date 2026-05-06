import { Router } from "express";
import { createUser, getUser } from "../controllers/userController.ts";
import { addCloth, getClothes } from "../controllers/clothController.ts";
import { analyzePhoto } from "../controllers/photoController.ts";

const router = Router();

// Usuarios
router.post("/users", createUser);
router.get("/users/:id", getUser);

// Ropa
router.post("/clothes", addCloth);
router.get("/clothes", getClothes);

// Análisis de foto para generar avatar
router.post("/analyze-photo", analyzePhoto);

export default router;
