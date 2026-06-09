# TwinFit

TwinFit es mi proyecto final: un probador virtual en 3D hecho con frontend web, Three.js y un backend conectado a MongoDB.

La idea principal es que una persona pueda crear un avatar, modificar su perfil antropometrico y probar algunas prendas dentro de una escena 3D. Es un prototipo funcional, no una aplicacion comercial terminada, pero sirve para demostrar la base de un probador virtual y los problemas reales que aparecen al adaptar ropa 3D a distintos cuerpos.

## Funcionalidades

La aplicacion permite:

- Crear un avatar femenino o masculino.
- Ajustar un perfil antropometrico basico para adaptar el avatar y las prendas.
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

## Dependencia con MongoDB

TwinFit necesita una base de datos MongoDB para poder guardar perfiles de usuario y consultar prendas desde el backend. En mi caso he usado MongoDB Atlas, pero tambien podria usarse una instancia local de MongoDB si se cambia la cadena de conexion.

La conexion se configura mediante la variable de entorno `MONGODB_URI`. Esta variable no se incluye directamente en el repositorio por seguridad, ya que contiene datos privados de acceso a la base de datos. Por eso se deja un archivo `.env.example` como plantilla.

El backend se conecta a la base de datos `twinfit`. Las colecciones principales que utiliza el proyecto son:

- `users`, para guardar los perfiles de usuario.
- `clothes`, para guardar informacion de prendas cuando se cargan desde la API.

Si MongoDB no esta configurado, la parte visual del frontend puede seguir mostrando algunas prendas locales de respaldo, pero las funciones de backend, como guardar perfiles, no funcionaran correctamente.


## Pruebas tecnicas automatizadas

El backend REST cuenta con una suite de pruebas automatizadas en `backend/tests/rest_api_test.ts`. Las pruebas levantan la app Express en un puerto efimero y usan un doble de MongoDB en memoria para validar los endpoints sin depender de credenciales ni de una instancia externa de MongoDB.

La suite cubre altas y consultas de usuarios, altas y listados de prendas, validaciones de campos obligatorios, rechazo de tipos de prenda no soportados y el estado desactivado del analisis automatico de foto.

Para ejecutarlas desde `TwinFit/`:

```bash
deno task test
```


## Pruebas de rendimiento del cliente

El frontend incluye un modo de medicion activable con `?perf=1`. Este modo registra FPS, tiempos de carga de modelos GLB, long tasks del hilo principal, memoria JS cuando el navegador la expone y estadisticas de Three.js como geometrias, texturas y triangulos renderizados.

Para medir en el ordenador:

```bash
deno task frontend
```

Abrir:

```text
http://127.0.0.1:4509/?perf=1
```

Para medir desde un movil conectado a la misma red:

```bash
deno task frontend:lan
```

Abrir en el movil:

```text
http://IP_DEL_ORDENADOR:4509/?perf=1
```


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
|-- ARRANCAR_TWINFIT_MAC.command
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

El backend necesita una variable de entorno con la conexion a MongoDB. Para probarlo en local, crea un archivo `.env` en la raiz del proyecto y otro dentro de `backend/`.

Archivo `.env` en la raiz del proyecto:

```env
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/twinfit?retryWrites=true&w=majority
```

Archivo `backend/.env`:

```env
PORT=4000
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/twinfit?retryWrites=true&w=majority
DB_NAME=twinfit
```

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

En macOS se puede usar el archivo:

```text
ARRANCAR_TWINFIT_MAC.command
```

Si macOS no deja abrirlo por permisos, ejecuta una vez:

```bash
chmod +x ARRANCAR_TWINFIT_MAC.command
```

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


