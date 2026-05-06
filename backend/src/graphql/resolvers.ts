import { getDB } from "../config/db.ts";

// Aquí es donde explico de dónde sacar los datos para cada cosa
export const resolvers = {
    Query: {
        hello: () => "¡Hola mundo!", // Un saludito rápido
        users: async () => {
            const db = getDB();
            return await db.collection("users").find().toArray();
        },
        clothes: async () => {
            const db = getDB();
            return await db.collection("clothes").find().toArray();
        },
    },
    // Ajusto el ID para que GraphQL lo lea bien
    User: {
        id: (parent: any) => parent._id.toString(),
    },
    Cloth: {
        id: (parent: any) => parent._id.toString(),
    },
};
