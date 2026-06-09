import express from "express";
import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import { typeDefs } from "./graphql/schema.ts";
import { resolvers } from "./graphql/resolvers.ts";
import { getUserFromToken } from "./auth.ts";
import router from "./routes/router.ts";

const DEFAULT_ALLOWED_ORIGINS = [
    "http://127.0.0.1:4509",
    "http://localhost:4509",
];

const getAllowedOrigins = () => {
    return (process.env.CORS_ORIGIN || DEFAULT_ALLOWED_ORIGINS.join(","))
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
};

export const configureSecurityMiddlewares = (app = express()) => {
    app.disable("x-powered-by");
    app.use((_req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        res.setHeader("Cache-Control", "no-store");
        next();
    });
    return app;
};

export const configureRestMiddlewares = (app = express()) => {
    configureSecurityMiddlewares(app);
    const allowedOrigins = getAllowedOrigins();
    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Origin not allowed by CORS"));
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }));
    app.use(express.json({ limit: "15mb" }));
    return app;
};

export const createRestApp = () => {
    const app = configureRestMiddlewares();
    app.use(router);
    return app;
};

export const createApp = async () => {
    const app = configureRestMiddlewares();

    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({ req }) => {
            const token = req.headers.authorization || "";
            const user = token ? await getUserFromToken(token) : null;
            return { user };
        },
    });

    await server.start();
    server.applyMiddleware({ app });
    app.use(router);

    return { app, graphqlPath: server.graphqlPath };
};
