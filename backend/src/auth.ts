import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
import { findUserById } from "./collections/users.ts";

const SUPER_SECRETO = process.env.SECRET;

// Aquí creo el token firmado para el usuario, ¡es como su pase VIP!
export const signToken = (userId: string) =>
    jwt.sign({ userId }, SUPER_SECRETO!, { expiresIn: "1h" });

// Con esto compruebo si el token que me pasan es válido o si alguien intenta engañarme
export const verifyToken = (
    token: string
): { userId: string } | null => {
    try {
        if (!SUPER_SECRETO) {
            throw new Error("SECRET no está definido, ¡ops!");
        }

        // Le quito el 'Bearer ' si lo trae para quedarme solo con el código
        const actualToken = token.startsWith("Bearer ") ? token.slice(7) : token;

        return jwt.verify(actualToken, SUPER_SECRETO) as { userId: string };
    } catch {
        return null;
    }
};

// Esta función me sirve para saber qué usuario es el que tiene el token
export const getUserFromToken = async (token: string) => {
    const payload = verifyToken(token);
    if (!payload) return null;

    return await findUserById(payload.userId);
};
