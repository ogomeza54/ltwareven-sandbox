# Sandbox local · HaulMaster Pro

Copia de evaluación de Codesmic para cotizar el conector con QuickBooks Online.
**Privada y confidencial.** No se comparte ni se sube a ningún otro lado.

Probado el 17-sep-2026 en macOS con Node 26.7 y PostgreSQL 16, sobre una base
vacía: 41 tablas, 93 llaves foráneas, login local y rutas protegidas respondiendo.

---

## 1. Clonar e instalar

```
git clone git@github.com:ogomeza54/ltwareven-sandbox.git
cd ltwareven-sandbox
npm install
```

## 2. Base de datos

El `.env.example` apunta a `postgresql://talavera:talavera@localhost:5432/talavera`.

**Con Docker:** `npm run db:up` la levanta con el `compose.yaml` del repo.

**Sin Docker (macOS con Homebrew):**

```
brew install postgresql@16
brew services start postgresql@16
/opt/homebrew/opt/postgresql@16/bin/psql -d postgres -c "create role talavera login password 'talavera';"
/opt/homebrew/opt/postgresql@16/bin/psql -d postgres -c "create database talavera owner talavera;"
```

## 3. Variables de entorno

```
cp .env.example .env
```

En `.env` cambia tres valores:

- `SESSION_SECRET`: cualquier cadena larga y aleatoria
- `LOCAL_ADMIN_EMAIL` y `LOCAL_ADMIN_PASSWORD`: el usuario con el que vas a entrar

`PORT=5001` ya viene así. En macOS el 5000 lo ocupa AirPlay.

## 4. Esquema y usuario, en este orden

```
npx drizzle-kit push --config drizzle.base.config.ts
INVOICE_MIGRATION_APPROVED=true npm run db:migrate
npm run db:seed
```

El orden importa. El `drizzle.config.ts` original carga el esquema base y el de
facturas juntos, y `drizzle-kit push` falla con el error 42830 porque crea las
llaves foráneas antes que los índices únicos. Por eso el esquema base va primero
con `drizzle.base.config.ts`, y el de facturas entra por su migración SQL.

## 5. Arrancar

```
npm run dev
```

Abre `http://localhost:5001` y entra con `LOCAL_ADMIN_EMAIL` y `LOCAL_ADMIN_PASSWORD`.

---

## Qué cambia respecto al repositorio original

Solo el commit `c7d7e2e`, con cuatro ajustes de portabilidad y ninguno de lógica
de negocio. `git show c7d7e2e` los muestra completos.

## A tomar en cuenta

- **La base arranca vacía.** El seed solo crea la empresa "Talavera Local" y el
  administrador. No trae inventario ni órdenes de trabajo: para reproducir un
  flujo hay que capturar los datos a mano.
- **La extracción de facturas por IA** necesita `OPENAI_API_KEY`. No hace falta
  para los flujos de inventario, que es donde vive la integración contable.
- **No configures `REMOTE_DATABASE_URL`.** Apunta a la base real del cliente.
- **El servidor escucha en `0.0.0.0`.** En una red compartida, cualquiera en la
  misma red puede abrirlo con tu IP y el puerto.
