# TwinFit

TwinFit es mi proyecto final: un probador virtual en 3D hecho con frontend web, Three.js y un backend conectado a MongoDB.

La idea principal es que una persona pueda crear un avatar, modificar sus medidas corporales y probar algunas prendas dentro de una escena 3D. Es un prototipo funcional, no una aplicacion comercial terminada, pero sirve para demostrar la base de un probador virtual y los problemas reales que aparecen al adaptar ropa 3D a distintos cuerpos.

## Funcionalidades

La aplicacion permite:

- Crear un avatar femenino o masculino.
- Cambiar medidas como altura, pecho, cintura y caderas.
- Modificar el tono de piel del avatar.
- Mover la camara para ver el modelo de frente, de lado o por detras.
- Probar prendas 3D sobre el avatar.
- Cambiar el color de las prendas.
- Guardar un perfil de usuario en MongoDB.

Actualmente el vestidor usa estas prendas:

- Vestido de transparencias.
- Vestido de flores.
- Camiseta masculina.
- Denim Mom Jean masculino.

## Tecnologias usadas

- HTML, CSS y JavaScript para el frontend.
- Three.js para la escena 3D, los modelos GLB, la camara, las luces y los controles.
- Deno y Express para el backend.
- MongoDB para guardar usuarios y prendas.
- Apollo Server y GraphQL como estructura preparada para posibles ampliaciones.

## Estructura del proyecto

```text
TwinFit/
|-- backend/
|   `-- src/
|       |-- controllers/
|       |-- graphql/
|       |-- models/
|       |-- routes/
|       `-- server.ts
|-- frontend/
|   |-- assets/
|   |-- css/
|   |-- js/
|   |   |-- avatar.js
|   |   |-- clothes.js
|   |   |-- main.js
|   |   `-- scene.js
|   `-- index.html
|-- docs/
|-- ARRANCAR_TWINFIT.bat
`-- deno.json
```

## Modelos 3D

La carpeta `frontend/assets/` contiene los modelos GLB que usa la aplicacion:

- `avatar_female.glb`
- `avatar_male.glb`
- `Vestido3.glb`
- `Vestido4.glb`
- `t-shirt.glb`
- `denim_mom_jean.glb`

Importante para GitHub: algunos modelos 3D pesan bastante. Si se suben los `.glb` al repositorio, puede hacer falta usar Git LFS, especialmente porque `Vestido3.glb` supera el limite normal de 100 MB de GitHub.

## Como ejecutar el proyecto

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd TwinFit
```

### 2. Instalar Deno

Es necesario tener Deno instalado en el ordenador:

https://deno.com/

### 3. Configurar MongoDB

El backend necesita una variable de entorno con la conexion a MongoDB. Para probarlo en local, crea un archivo `.env` en la raiz del proyecto:

```env
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/twinfit?retryWrites=true&w=majority
```

No subas el archivo `.env` a GitHub, porque contiene credenciales privadas.

El backend se levanta en:

```text
http://localhost:4000
```

### 4. Arrancar la aplicacion

En Windows, la forma mas facil es ejecutar:

```text
ARRANCAR_TWINFIT.bat
```

Este archivo abre el backend, el frontend y despues carga la aplicacion en el navegador.

La URL del frontend es:

```text
http://127.0.0.1:4509/
```

Tambien se puede ejecutar manualmente con dos terminales desde la carpeta `TwinFit/`:

```bash
deno task backend
```

```bash
deno task frontend
```

## Notas del desarrollo

La parte mas complicada del proyecto ha sido el ajuste de la ropa. Al principio parecia que bastaba con escalar cada prenda, pero en la practica no funcionaba asi. Una camiseta puede quedar bien de frente y mal de lado, o un pantalon puede encajar en una talla y deformarse en otra.

Por eso, en `frontend/js/clothes.js` hay logica especifica para cada prenda. El denim, la camiseta y los vestidos tienen ajustes propios de escala, posicion y clipping. En este prototipo he priorizado una solucion ligera y en tiempo real antes que una simulacion fisica completa de tela.

TwinFit queda como una base funcional sobre la que se podrian seguir anadiendo mejoras, como mas prendas, recomendaciones de talla, modelos 3D mejor preparados o una simulacion de tejido mas realista.


