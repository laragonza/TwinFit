import { getDB } from "../config/db.ts";
import { ObjectId } from "mongodb";

/**
 * Retrieves a user document by its unique identifier.
 * 
 * @param id - The user ID string.
 * @returns A promise determining the user document or null.
 */
export const findUserById = async (id: string) => {
    const db = getDB();
    try {
        return await db.collection("users").findOne({ _id: new ObjectId(id) });
    } catch (error) {
        console.error("Error finding user by id:", error);
        return null;
    }
};
