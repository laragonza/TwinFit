import { assert, assertEquals, assertMatch } from "std/assert/mod.ts";
import type { Db } from "mongodb";
import { createRestApp } from "../src/app.ts";
import { resetDBForTesting, setDBForTesting } from "../src/config/db.ts";

type StoredDocument = Record<string, unknown> & { _id?: unknown };
type StoredUser = StoredDocument & {
    name: string;
    height: number;
    measures: {
        chest: number;
        waist: number;
        hips: number;
    };
    anthropometricProfile: {
        unit: string;
        dimensions: Record<string, number>;
    };
};

class InMemoryCollection<T extends StoredDocument> {
    documents: T[];

    constructor(initialDocuments: T[] = []) {
        this.documents = [...initialDocuments];
    }

    async insertOne(document: T) {
        this.documents.push(document);
        return { insertedId: document._id };
    }

    async findOne(query: { _id?: unknown }) {
        return this.documents.find((document) => {
            return String(document._id) === String(query._id);
        }) ?? null;
    }

    find() {
        return {
            toArray: async () => [...this.documents],
        };
    }
}

class InMemoryDb {
    private readonly collections = new Map<string, InMemoryCollection<StoredDocument>>();

    collection<T extends StoredDocument>(name: string) {
        if (!this.collections.has(name)) {
            this.collections.set(name, new InMemoryCollection());
        }

        return this.collections.get(name) as InMemoryCollection<T>;
    }
}

interface TestServer {
    address(): string | { port: number } | null;
    close(callback: (error?: Error) => void): void;
}

const startTestApi = async () => {
    const db = new InMemoryDb();
    setDBForTesting(db as unknown as Db);

    const app = createRestApp();
    const server = await new Promise<TestServer>((resolve) => {
        const instance = app.listen(0, () => resolve(instance as TestServer));
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("No se pudo obtener el puerto de pruebas");
    }

    return {
        db,
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: async () => {
            await new Promise<void>((resolve, reject) => {
                server.close((error?: Error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            await resetDBForTesting();
        },
    };
};

const postJson = (url: string, body: unknown) => {
    return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
};

Deno.test("POST /users crea un usuario y lo guarda en la coleccion users", async () => {
    const api = await startTestApi();

    try {
        const response = await postJson(`${api.baseUrl}/users`, {
            name: "Lara",
            height: 168,
            gender: "female",
            measures: {
                chest: 88,
                waist: 66,
                hips: 94,
            },
        });
        const body = await response.json();
        const users = api.db.collection<StoredUser>("users").documents;

        assertEquals(response.status, 201);
        assertEquals(typeof body.message, "string");
        assertMatch(body.id, /^[a-f\d]{24}$/);
        assertEquals(users.length, 1);
        assertEquals(users[0].name, "Lara");
        assertEquals(users[0].height, 168);
        assertEquals(users[0].anthropometricProfile.dimensions.chest, 88);
        assertEquals(users[0].anthropometricProfile.unit, "cm");
    } finally {
        await api.close();
    }
});

Deno.test("POST /users acepta un perfil antropometrico extensible", async () => {
    const api = await startTestApi();

    try {
        const response = await postJson(`${api.baseUrl}/users`, {
            name: "Perfil parametrico",
            gender: "female",
            anthropometricProfile: {
                stature: 169,
                dimensions: {
                    chest: 89,
                    waist: 67,
                    hips: 95,
                    shoulder_width: 42,
                    sleeve_length: 58,
                },
            },
        });
        const body = await response.json();
        const storedUser = api.db.collection<StoredUser>("users").documents[0];

        assertEquals(response.status, 201);
        assertMatch(body.id, /^[a-f\d]{24}$/);
        assertEquals(storedUser.height, 169);
        assertEquals(storedUser.measures.chest, 89);
        assertEquals(storedUser.anthropometricProfile.dimensions.shoulder_width, 42);
        assertEquals(storedUser.anthropometricProfile.dimensions.sleeve_length, 58);
    } finally {
        await api.close();
    }
});

Deno.test("POST /users rechaza perfiles incompletos sin insertar en MongoDB", async () => {
    const api = await startTestApi();

    try {
        const response = await postJson(`${api.baseUrl}/users`, {
            name: "Perfil incompleto",
            gender: "female",
        });
        const body = await response.json();

        assertEquals(response.status, 400);
        assertMatch(body.error, /Faltan campos obligatorios/);
        assertEquals(api.db.collection("users").documents.length, 0);
    } finally {
        await api.close();
    }
});

Deno.test("GET /users/:id devuelve el usuario persistido", async () => {
    const api = await startTestApi();

    try {
        const createResponse = await postJson(`${api.baseUrl}/users`, {
            name: "Ada",
            height: 172,
            gender: "female",
            measures: {
                chest: 90,
                waist: 68,
                hips: 96,
            },
        });
        await createResponse.json();

        const storedUser = api.db.collection<StoredUser>("users").documents[0];
        const response = await fetch(`${api.baseUrl}/users/${String(storedUser._id)}`);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertEquals(body._id, String(storedUser._id));
        assertEquals(body.name, "Ada");
        assertEquals(body.measures.waist, 68);
        assertEquals(body.anthropometricProfile.dimensions.waist, 68);
    } finally {
        await api.close();
    }
});

Deno.test("GET /users/:id devuelve 404 si el usuario no existe", async () => {
    const api = await startTestApi();

    try {
        const response = await fetch(`${api.baseUrl}/users/507f1f77bcf86cd799439011`);
        const body = await response.json();

        assertEquals(response.status, 404);
        assertEquals(body.error, "No he encontrado al usuario");
    } finally {
        await api.close();
    }
});

Deno.test("POST /clothes crea una prenda soportada y la guarda en clothes", async () => {
    const api = await startTestApi();

    try {
        const response = await postJson(`${api.baseUrl}/clothes`, {
            name: "Vestido de flores",
            type: "dress4",
            modelPath: "assets/Vestido4.glb",
        });
        const body = await response.json();
        const clothes = api.db.collection("clothes").documents;

        assertEquals(response.status, 201);
        assertEquals(typeof body.message, "string");
        assertMatch(body.id, /^[a-f\d]{24}$/);
        assertEquals(clothes.length, 1);
        assertEquals(clothes[0].type, "dress4");
    } finally {
        await api.close();
    }
});

Deno.test("POST /clothes rechaza tipos de prenda no soportados", async () => {
    const api = await startTestApi();

    try {
        const response = await postJson(`${api.baseUrl}/clothes`, {
            name: "Chaqueta",
            type: "jacket",
            modelPath: "assets/jacket.glb",
        });
        const body = await response.json();

        assertEquals(response.status, 400);
        assertEquals(body.error, "Tipo de prenda no soportado");
        assertEquals(api.db.collection("clothes").documents.length, 0);
    } finally {
        await api.close();
    }
});

Deno.test("GET /clothes devuelve las prendas persistidas", async () => {
    const api = await startTestApi();

    try {
        const createResponse = await postJson(`${api.baseUrl}/clothes`, {
            name: "Camiseta masculina",
            type: "tshirt",
            modelPath: "assets/t-shirt.glb",
        });
        await createResponse.json();

        const response = await fetch(`${api.baseUrl}/clothes`);
        const body = await response.json();

        assertEquals(response.status, 200);
        assertEquals(body.length, 1);
        assertEquals(body[0].name, "Camiseta masculina");
        assertEquals(body[0].type, "tshirt");
    } finally {
        await api.close();
    }
});

Deno.test("POST /analyze-photo informa de que el analisis automatico esta desactivado", async () => {
    const api = await startTestApi();

    try {
        const response = await postJson(`${api.baseUrl}/analyze-photo`, {
            image: "data:image/png;base64,AAAA",
        });
        const body = await response.json();

        assertEquals(response.status, 410);
        assert(body.error.includes("desactivado"));
    } finally {
        await api.close();
    }
});
