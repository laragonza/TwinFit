import express from "express";
import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import { connectToMongoDB } from "./config/db.ts";
import { typeDefs } from "./graphql/schema.ts";
import { resolvers } from "./graphql/resolvers.ts";
import { getUserFromToken } from "./auth.ts";
import router from "./routes/router.ts";

// Aquí arranco todo el tinglado
const start = async () => {
    try {
        // Intento conectarme a la base de datos
        await connectToMongoDB();
        console.log("¡Conectada a MongoDB!");
    } catch (err) {
        console.error("¡SOCORRO! No he podido conectar a MongoDB:", err);
        process.exit(1);
    }

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '15mb' })); // Límite ampliado para imágenes en base64

    // Configuro el servidor de GraphQL
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({ req }) => {
            // Busco el usuario si me pasan un token
            const token = req.headers.authorization || "";
            const user = token ? await getUserFromToken(token) : null;
            return { user };
        },
    });

    await server.start();
    server.applyMiddleware({ app });

    // Uso mis rutas de siempre
    app.use(router);

    // Lanzo el servidor en el puerto 4000
    app.listen(4000, () => {
        console.log(`🚀 Servidor listo en http://localhost:4000${server.graphqlPath}`);
        console.log("🚀 Rutas REST listas en http://localhost:4000");
    });
};

start().catch((err) => console.error(err));
