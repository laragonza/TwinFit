import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.ts";
import { buildAnthropometricProfile, extractCoreMeasures } from "../models/anthropometry.ts";
import { UserSchema } from "../models/user.ts";

export const createUser = async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const users = db.collection<UserSchema>("users");
        const value = req.body;

        if (!value || typeof value !== "object") {
            res.status(400).json({ error: "Cuerpo invalido, esperaba un JSON" });
            return;
        }

        const { name, gender } = value as {
            name: string;
            gender: "male" | "female";
        };
        const { missing: missingProfileFields, profile } = buildAnthropometricProfile(
            value as Record<string, unknown>,
        );

        const missing: string[] = [];
        if (!name) missing.push("nombre");
        if (!gender) missing.push("genero");
        missing.push(...missingProfileFields);

        if (missing.length > 0 || !profile) {
            res.status(400).json({ error: `Faltan campos obligatorios: ${missing.join(", ")}` });
            return;
        }

        const measures = extractCoreMeasures(profile);
        const result = await users.insertOne({
            name,
            gender,
            height: profile.stature,
            anthropometricProfile: profile,
            measures,
            _id: new ObjectId(),
        });

        res.status(201).json({ message: "Usuario creado", id: result.insertedId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

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
        res.status(500).json({ error: "ID invalido o error del servidor" });
    }
};
