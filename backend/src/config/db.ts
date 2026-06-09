import { Db, MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

let client: MongoClient | undefined;
let db: Db | undefined;

const dbName = "twinfit";

export const connectToMongoDB = async () => {
  try {
    const mongoUrl = process.env.MONGODB_URI;

    if (!mongoUrl) {
      throw new Error("No se ha definido MONGODB_URI en las variables de entorno");
    }

    const maskedUrl = mongoUrl.replace(/:([^@]+)@/, ":****@");
    console.log(`Conectando a MongoDB en: ${maskedUrl}`);

    client = new MongoClient(mongoUrl);
    await client.connect();

    db = client.db(dbName);
    console.log("Conectada a la base de datos de MongoDB");
  } catch (err) {
    console.error("Error al conectar con MongoDB:", err);
    throw err;
  }
};

export const getDB = (): Db => {
  if (!db) {
    throw new Error("La base de datos no esta inicializada");
  }
  return db;
};

export const setDBForTesting = (testDb: Db) => {
  db = testDb;
};

export const resetDBForTesting = async () => {
  if (client) {
    await client.close();
  }
  client = undefined;
  db = undefined;
};
