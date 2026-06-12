# Auditoría del estado actual del proyecto Yukon Connect

Fecha de revisión: 2026-06-12  
Alcance: revisión estática del repositorio, ejecución de tests/checks locales disponibles y validación de que el código no requiere acceso a la base real de PostgreSQL/Supabase.

## Resumen ejecutivo

El repositorio está **parcialmente listo para continuar**, pero todavía no está en estado de readiness completo para nuevas features de producto.

Lo implementado hasta ahora está alineado con la arquitectura objetivo en los puntos más importantes: monorepo TypeScript, API Node.js de solo lectura, uso de `vw_contracts_full` como fuente principal para contratos, Docker Compose local sin tocar producción, manejo explícito de ausencia de `DATABASE_URL`, validación básica de parámetros, paginación con límite máximo y consultas SQL parametrizadas.

Durante esta auditoría se corrigieron dos problemas pequeños y seguros:

1. `apps/api/package.json` tenía JSON inválido por una coma faltante entre scripts, lo que podía romper comandos de workspace.
2. La búsqueda con `q` dependía demasiado de que `contract_search_index` existiera; ahora mantiene el uso preferente del índice full-text, pero degrada a una búsqueda directa parametrizada sobre `vw_contracts_full` si la tabla del índice no existe, y también puede encontrar coincidencias directas cuando el índice está vacío.

Aun así, antes de avanzar con features grandes conviene cerrar algunos puntos: agregar scripts formales de `build`/`typecheck`/`lint`, decidir estrategia de CI GitLab, revisar performance real de `/contracts/filters` y búsquedas fallback en una copia representativa de 500k+ registros, y generar/commitear documentación de esquema actual solo desde un entorno controlado.

## Estado revisado por área

### 1. Estructura del repositorio

**Estado:** correcto para una base inicial.

- Existe un monorepo con workspaces `apps/*` y `packages/*`.
- `apps/api` contiene la API Node.js + TypeScript actual.
- `apps/frontend`, `apps/strapi` y `packages/shared` existen como placeholders, sin implementación pesada.
- `infra/sql` contiene SQL específico para el índice de búsqueda.
- `docs` contiene documentación de API y esta auditoría.

**Observación:** el README todavía describe algunas partes como futuras/placeholders aunque ya existe una API básica; se actualizó para reflejar el estado actual.

### 2. Configuración Docker Compose

**Estado:** adecuado para desarrollo local inicial.

- PostgreSQL local arranca por defecto.
- pgAdmin está detrás del perfil `tools`.
- API, frontend y Strapi están detrás del perfil `apps` y siguen como placeholders operativos, sin ejecutar lógica productiva automáticamente.
- No hay instrucciones destructivas ni recreación automática del schema real.

**Riesgo:** la imagen `postgres:18-alpine` es moderna y puede no coincidir con Supabase/PostgreSQL real. Para reproducibilidad, conviene alinear la versión con el entorno real o documentar explícitamente la diferencia antes de validar performance/planes de ejecución.

### 3. Variables de entorno y `.env.example`

**Estado:** correcto para desarrollo local.

- `.env.example` no contiene secretos reales.
- `DATABASE_URL` apunta al PostgreSQL interno de Docker por defecto.
- `STRAPI_DATABASE_URL` existe, pero Strapi no está implementado ni duplica contratos.
- `API_PORT` y `FRONTEND_PORT` están parametrizados.

**Pendiente:** documentar variables de SSL para Supabase (`PGSSLMODE=require` o `DATABASE_SSL=true`) también en `.env.example` si el equipo las usará frecuentemente.

### 4. Script de inspección de base de datos

**Estado:** alineado con el criterio de no depender de acceso a la base real.

- Existe un script completo en `apps/api/scripts/inspect-database-schema.ts` que inspecciona metadatos y genera `docs/database-current.md`.
- También existe un script más pequeño en `apps/api/src/scripts/inspect-schema.ts` que genera JSON.
- El README documenta que la inspección es read-only y que no debe ejecutar DDL/DML destructivo.

**Pendiente:** hay dos rutas de inspección con alcances distintos (`db:inspect` y `inspect:schema`). Conviene mantener ambas solo si tienen propósito claro; de lo contrario, unificarlas para evitar confusión.

### 5. Documentación generada sobre la base

**Estado:** incompleta en el repositorio actual.

- No existe `docs/database-current.md` committeado.
- Esto es aceptable porque Codex/CI no deben depender de la base real, pero significa que la auditoría no puede validar la correspondencia exacta de columnas/vistas contra producción.

**Recomendación:** generar `docs/database-current.md` desde una copia local/staging o desde producción únicamente cuando sea una acción humana explícita, con credenciales fuera del repo.

### 6. API de contratos

**Estado:** base sólida, read-only y enfocada en la base existente.

- La API no ejecuta migraciones ni recrea schema al arrancar.
- Las consultas principales leen de `vw_contracts_full`.
- Los filtros se componen desde un mapa estático de columnas permitidas.
- Los valores de usuario se pasan como parámetros `$1`, `$2`, etc.

**Pendiente:** faltan scripts formales de compilación/typecheck y una capa de logging/observabilidad de errores para operación real.

### 7. Endpoints revisados

#### `GET /health`

**Estado:** correcto.

- Responde aunque `DATABASE_URL` no exista.
- Reporta `configured=false` y `connected=false` sin romper el proceso.

#### `GET /contracts`

**Estado:** correcto como primera iteración.

- Soporta paginación.
- Soporta filtros exactos por vendor, department, community, fiscalYear, projectManager, contractType y tenderClass.
- Soporta rangos de amount y fechas de inicio.
- Usa `vw_contracts_full` como fuente principal.
- Usa full-text search cuando `q` existe.

**Brecha funcional frente al objetivo:** aún no hay filtros explícitos por `contract_no`, `contract_description`, `amount` exacto, `type_code` o `type_name` como parámetros dedicados. Algunos pueden encontrarse mediante `q`, pero no como filtros estructurados.

#### `GET /contracts/:id`

**Estado:** correcto.

- Valida que `id` sea entero positivo.
- Lee de `vw_contracts_full`.
- Devuelve `404` si no existe.

#### `GET /contracts/filters`

**Estado:** funcional pero con riesgo de performance.

- Devuelve listas distintas desde `vw_contracts_full`.
- En una base de 500k+ registros, `array_agg(distinct ...)` sobre varios campos puede ser costoso si la vista no está optimizada/materializada o si no hay índices adecuados en tablas subyacentes.

**Recomendación:** medir en una copia representativa y considerar límites, caché o endpoints separados si se vuelve lento.

### 8. Implementación de búsqueda full-text

**Estado:** correcto como primera iteración, con fallback corregido en esta auditoría.

- `infra/sql/contract_search_index.sql` define tabla, índices GIN y función de reconstrucción.
- La API usa `websearch_to_tsquery('english', ...)` y ranking con `ts_rank_cd` cuando el índice existe.
- Se priorizan coincidencias exactas de `contract_no`, luego coincidencias directas de número, vendor y project manager.
- Desde esta auditoría, las coincidencias directas también cubren descripción, department, community, fiscal year, amount, contract type, tender class, type code y type name.
- Si `contract_search_index` no existe, la API cae a una búsqueda directa parametrizada sobre `vw_contracts_full`.

**Riesgo:** el fallback directo usa `ILIKE` y puede ser lento en 500k+ registros. Es correcto como degradación funcional, no como camino principal de performance.

### 9. Uso de `vw_contracts_full` como fuente principal de lectura

**Estado:** correcto.

- Listado, detalle, filtros y fallback de búsqueda leen de `vw_contracts_full`.
- `contract_records` solo se une para filtrar por `start_date`.

**Pendiente:** validar en la documentación generada que `vw_contracts_full` contiene todas las columnas que la API selecciona (`project_manager`, `work_community`, `postal_code`, flags de negocio, metadatos de tender/contract, `created_at`, `updated_at`).

### 10. Seguridad de queries SQL

**Estado:** bueno.

- No se interpolan valores de usuario directamente en SQL.
- Los filtros de columna están restringidos a un mapa estático.
- Los valores se envían con placeholders parametrizados.
- No hay SQL destructivo en la API.

**Riesgo residual:** `infra/sql/contract_search_index.sql` incluye `truncate table contract_search_index restart identity` dentro de la función de reconstrucción. No toca contratos reales, pero sí borra/recrea el índice auxiliar. Debe ejecutarse solo de forma explícita y controlada.

### 11. Validación de parámetros

**Estado:** adecuado para la API actual.

- `page` y `pageSize` deben ser enteros positivos.
- `pageSize` tiene máximo de 100.
- `minAmount`/`maxAmount` deben ser números válidos y se valida el orden.
- Fechas deben tener formato `YYYY-MM-DD` y se valida el rango.
- `id` debe ser entero positivo.

**Pendiente:** definir límites de longitud para strings (`q`, vendor, department, etc.) para evitar consultas muy grandes o accidentales.

### 12. Paginación

**Estado:** correcto para offset pagination inicial.

- `page` default: 1.
- `pageSize` default: 25.
- `offset = (page - 1) * pageSize`.
- La respuesta incluye `total`.

**Riesgo:** offset pagination puede degradar en páginas profundas sobre 500k+ registros. Para navegación profunda o exportaciones será necesario evaluar cursor pagination o keyset pagination.

### 13. `pageSize` máximo

**Estado:** correcto.

- Máximo actual: 100.
- Requests superiores devuelven `400`.

### 14. Manejo de errores si `DATABASE_URL` no existe

**Estado:** correcto.

- La API puede crearse con `db: null`.
- `/health` sigue funcionando.
- Endpoints de contratos devuelven `503` si no hay repositorio/base configurada.
- Los scripts de inspección documentados no requieren acceso a la base real para salir correctamente.

### 15. Tests existentes

**Estado:** útiles pero mínimos.

- Hay tests de `/health`, validación de paginación, paso de `q`, construcción de SQL full-text y fallback cuando `contract_search_index` no existe.
- No hay tests de integración contra PostgreSQL local.
- No hay tests de `/contracts/:id` ni `/contracts/filters` en la cobertura actual.
- No hay cobertura de fechas, montos, máximo de `pageSize` ni error `503` para contratos sin DB.

### 16. README y documentación técnica

**Estado:** razonable, con ajustes realizados.

- README cubre layout, Docker Compose, comandos de workspace, inspección de schema y API.
- `docs/api.md` cubre endpoints y parámetros.
- Esta auditoría agrega la evaluación de readiness y riesgos antes de nuevas features.

**Pendiente:** documentar GitLab CI/CD cuando exista `.gitlab-ci.yml`; actualmente no hay pipeline en el repo.

### 17. Riesgos antes de continuar

1. **CI/CD ausente:** no hay `.gitlab-ci.yml`, por lo que no hay garantía automatizada de lint/test/build en merge requests.
2. **Typecheck/build formal ausente:** el workspace no define `typecheck` y la API no define `build`; Node ejecuta TypeScript con `--experimental-strip-types`, pero eso no reemplaza una verificación TypeScript completa.
3. **Performance no validada con 500k+ registros:** especialmente `/contracts/filters`, búsqueda fallback con `ILIKE`, conteos totales y offset pagination profunda.
4. **Documentación de schema no generada en repo:** no se puede confirmar offline que `vw_contracts_full` expone todas las columnas esperadas.
5. **Reconstrucción de índice auxiliar:** `rebuild_contract_search_index()` trunca la tabla auxiliar del índice; debe ejecutarse manualmente y con ventanas/locks evaluados.
6. **Filtros estructurados incompletos frente al objetivo:** faltan parámetros dedicados para algunos campos solicitados por producto.
7. **Strapi sigue correctamente como placeholder:** esto es positivo para evitar duplicar contratos, pero implica que el CMS/admin aún no aporta capacidades editoriales.

## Decisiones técnicas ya correctas

- Mantener PostgreSQL/Supabase como fuente principal de contratos.
- Usar Strapi solo como futuro CMS/admin, no como motor de búsqueda ni réplica de 500k contratos.
- Leer desde `vw_contracts_full` como contrato de lectura consolidado.
- Usar SQL parametrizado y columnas permitidas por lista blanca.
- Evitar fallar el proyecto cuando `DATABASE_URL` no existe.
- Mantener scripts de inspección read-only y separados de migraciones.
- Limitar `pageSize` a 100.
- Preparar full-text search en PostgreSQL antes de introducir pgvector.
- No recrear ni modificar automáticamente el schema existente.

## Qué hay que corregir antes de seguir

### Bloqueante recomendado antes de features grandes

- Agregar scripts reales de `typecheck`, `build` y `lint` al menos para `apps/api`.
- Agregar `.gitlab-ci.yml` con instalación, typecheck, tests y build.
- Generar `docs/database-current.md` desde un entorno autorizado o documentar explícitamente por qué no se versiona.
- Validar en una base representativa que `vw_contracts_full` tiene todas las columnas usadas por la API.
- Medir queries principales con `EXPLAIN ANALYZE` en staging/local copy: listado, búsqueda con índice, búsqueda fallback, filtros y conteo.

### Importante pero no bloqueante inmediato

- Agregar límites de longitud para parámetros string.
- Agregar tests para `/contracts/:id`, `/contracts/filters`, `pageSize > 100`, rangos inválidos y respuesta `503` sin DB.
- Documentar mejor la diferencia entre `inspect:schema` y `db:inspect`, o unificarlos.
- Revisar si `postgres:18-alpine` debe fijarse a la versión real del entorno Supabase/PostgreSQL.

## Checklist de readiness para continuar

| Área | Estado | Comentario |
| --- | --- | --- |
| Monorepo base | Listo | Estructura clara para API/frontend/Strapi/shared. |
| Docker Compose local | Listo con observación | No toca producción; revisar versión PostgreSQL. |
| `.env.example` | Listo | Sin secretos reales; considerar variables SSL. |
| API read-only | Listo | No migra ni destruye datos. |
| `vw_contracts_full` como lectura principal | Listo pendiente de validar contra DB | El código la usa, falta confirmar columnas reales. |
| `/health` | Listo | Funciona sin DB. |
| `/contracts` | Parcialmente listo | Buena base; faltan algunos filtros estructurados y pruebas de performance. |
| `/contracts/:id` | Listo básico | Falta test dedicado. |
| `/contracts/filters` | Parcialmente listo | Funcional; riesgo de performance. |
| Full-text search | Listo básico | Índice preferente + fallback funcional. |
| Seguridad SQL | Listo | Parametrizado y lista blanca de columnas. |
| Validación | Parcialmente listo | Falta longitud máxima de strings. |
| Paginación | Listo básico | Offset pagination; riesgo en páginas profundas. |
| Tests | Parcialmente listo | Unitarios mínimos pasan; falta cobertura. |
| Typecheck/build/lint | No listo | No hay scripts formales suficientes. |
| GitLab CI/CD | No listo | No existe pipeline. |
| Documentación de schema real | Parcial | Script existe; reporte actual no está versionado. |

## Siguiente orden recomendado de tareas

1. **Endurecer calidad del repo:** agregar `typecheck`, `build`, `lint` y `.gitlab-ci.yml` mínimos.
2. **Validar schema real de forma controlada:** ejecutar inspección read-only y versionar `docs/database-current.md` si no contiene secretos.
3. **Completar cobertura de tests API:** endpoints faltantes, validaciones y error paths.
4. **Medir performance SQL:** usar una copia representativa de 500k+ registros para evaluar `vw_contracts_full`, `contract_search_index`, filtros y conteos.
5. **Optimizar filtros/listados si hace falta:** índices, materialización, caché o endpoints separados, según evidencia.
6. **Agregar filtros estructurados faltantes:** `contract_no`, `contract_description`, `amount`, `type_code`, `type_name`, sin introducir tags/sinónimos aún.
7. **Después de lo anterior, avanzar a frontend Next.js:** consumir la API existente con estados de carga/error y paginación.
8. **Luego integrar Strapi como CMS/admin:** solo para contenido/configuración administrativa, no para duplicar contratos.
9. **Finalmente preparar expansión conceptual:** tags/sinónimos y diseño futuro para pgvector cuando FTS esté validado.

## Conclusión

El proyecto va en la dirección correcta y no viola los criterios críticos de seguridad de datos: no toca producción automáticamente, no recrea el schema existente, no borra contratos, no duplica datos en Strapi y puede funcionar sin acceso de Codex a la base real.

La recomendación es **continuar**, pero no con features de usuario final todavía. Primero conviene cerrar calidad automatizada, documentación real del schema y validación de performance sobre datos representativos.
