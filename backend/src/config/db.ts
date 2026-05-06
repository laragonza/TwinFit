import { Db, MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

let client: MongoClient;
let db: Db;

const dbName = "twinfit";

// Aquí me conecto a MongoDB, ¡crucemos los dedos!
export const connectToMongoDB = async () => {
  try {
    const mongoUrl = process.env.MONGODB_URI;

    if (!mongoUrl) {
      throw new Error("No encuentro la MONGODB_URI en las variables de entorno, ¡ups!");
    }

    // Oculto la contraseña para que no se vea en los logs, por seguridad
    const maskedUrl = mongoUrl.replace(/:([^@]+)@/, ":****@");
    console.log(`Conectando a MongoDB en: ${maskedUrl}`);

    client = new MongoClient(mongoUrl);
    await client.connect();

    db = client.db(dbName);
    console.log("✅ ¡Conectada a la base de datos de MongoDB con éxito!");
  } catch (err) {
    console.error("❌ Jo, ha habido un error al conectar:", err);
    throw err;
  }
};

// Con esto pillo la base de datos cuando la necesito
export const getDB = (): Db => {
  if (!db) {
    throw new Error("❌ La base de datos no está lista todavía");
  }
  return db;
};
