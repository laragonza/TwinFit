import { Request, Response } from "express";
import { getDB } from "../config/db.ts";
import { ClothSchema, ClothType, SUPPORTED_CLOTH_TYPES } from "../models/cloth.ts";
import { ObjectId } from "mongodb";

// Este es el controlador para manejar la ropita con Express
export const addCloth = async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const clothes = db.collection<ClothSchema>("clothes");

        const value = req.body;

        if (!value) {
            res.status(400).json({ error: "El cuerpo está vacío, esperaba un JSON" });
            return;
        }

        const { name, type, modelPath } = value as {
            name: string;
            type: ClothType;
            modelPath: string;
        };

        // Reviso que no falte nada importante
        if (!name || !type || !modelPath) {
            res.status(400).json({ error: "Faltan campos que son obligatorios" });
            return;
        }

        if (!SUPPORTED_CLOTH_TYPES.includes(type)) {
            res.status(400).json({ error: "Tipo de prenda no soportado" });
            return;
        }

        // Guardo la nueva prenda en la colección
        const result = await clothes.insertOne({
            name,
            type,
            modelPath,
            _id: new ObjectId(),
        });

        res.status(201).json({ message: "¡Ropita añadida!", id: result.insertedId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor, ¡qué mala suerte!" });
    }
};

// Aquí traigo toda la ropa que tenemos guardada
export const getClothes = async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const clothes = db.collection<ClothSchema>("clothes");

        const allClothes = await clothes.find({}).toArray();
        res.status(200).json(allClothes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor..." });
    }
};
