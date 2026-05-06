import { Request, Response } from "express";
import { getDB } from "../config/db.ts";
import { UserSchema } from "../models/user.ts";
import { ObjectId } from "mongodb";

// Este es el controlador para los usuarios con Express
export const createUser = async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const users = db.collection<UserSchema>("users");

        const value = req.body;

        if (!value) {
            res.status(400).json({ error: "Cuerpo inválido, esperaba un JSON" });
            return;
        }

        const { name, height, measures, gender } = value as {
            name: string;
            height: number;
            measures: { chest: number; waist: number; hips: number };
            gender: 'male' | 'female';
        };

        // Compruebo que no falte ningún dato e indico exactamente cuáles faltan
        const missing: string[] = [];
        if (!name)    missing.push("nombre");
        if (!height)  missing.push("estatura");
        if (!gender)  missing.push("género");
        if (!measures || !measures.chest || !measures.waist || !measures.hips)
            missing.push("medidas (pecho, cintura, caderas)");

        if (missing.length > 0) {
            res.status(400).json({ error: `Faltan campos obligatorios: ${missing.join(", ")}` });
            return;
        }

        // Registro al nuevo usuario en la base de datos
        const result = await users.insertOne({
            name,
            height,
            measures,
            gender,
            _id: new ObjectId(),
        });

        res.status(201).json({ message: "¡Usuario creado!", id: result.insertedId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno, algo ha fallado..." });
    }
};

// Aquí busco a un usuario por su ID
export const getUser = async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const users = db.collection<UserSchema>("users");

        const id = req.params.id;
        if (!id) {
            res.status(400).json({ error: "Falta el ID" });
            return;
        }

        const user = await users.findOne({ _id: new ObjectId(id) });

        if (!user) {
            res.status(404).json({ error: "No he encontrado al usuario" });
            return;
        }

        res.status(200).json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "ID inválido o error del servidor" });
    }
};
