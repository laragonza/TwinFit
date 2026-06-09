import { connectToMongoDB } from "./config/db.ts";
import { createApp } from "./app.ts";

const start = async () => {
    try {
        await connectToMongoDB();
        console.log("Conectada a MongoDB");
    } catch (err) {
        console.error("No se ha podido conectar a MongoDB:", err);
        process.exit(1);
    }

    const { app, graphqlPath } = await createApp();
    const port = Number(process.env.PORT ?? 4000);

    app.listen(port, () => {
        console.log(`Servidor listo en http://localhost:${port}${graphqlPath}`);
        console.log(`Rutas REST listas en http://localhost:${port}`);
    });
};

start().catch((err) => console.error(err));
