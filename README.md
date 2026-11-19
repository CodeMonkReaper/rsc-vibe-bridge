# rsc-vibe-bridge

CLI local en Node (`rsc-vibe`) para delegar tareas desde proyectos gobernados por **RSC** hacia el binario oficial **Mistral Vibe** en Windows 11 / PowerShell 7, con límites de seguridad, concurrencia acotada, consulta de modelos en vivo y selección de modelo por corrida.

Requisitos: **Node >= 18**, **Git for Windows** y **`vibe`** instalado y autenticado. Sin dependencias externas de runtime, sin WSL y sin almacenar API keys en el repositorio.

---

## Instalación en un solo comando

Desde la carpeta del repositorio clonado (o directamente desde GitHub):

```powershell
# Opción 1: desde tu copia local (deja el comando global `rsc-vibe` listo)
npm link

# Opción 2: directamente desde GitHub en un solo comando
npm install -g git+https://github.com/<tu-usuario>/rsc-vibe-bridge.git
```

*(Sin instalación global, todos los comandos funcionan igualmente con `node <ruta-al-repo>\bin\cli.js <comando>`.)*

---

## Activar en cualquier proyecto RSC (un solo comando)

Desde la raíz de cualquier proyecto que tenga `.rsc.json`:

```powershell
rsc-vibe init
```

Esto lee `catalogVersion` de `.rsc.json` y crea sin sobrescribir archivos existentes:
- `.vibe/config.toml` (capa local segura sin credenciales).
- Los 5 perfiles acotados en `.vibe/agents/` (`architect`, `developer`, `debugger`, `reviewer`, `tester`).
- `01-TOOLS/vibe-bridge/models.json`, `README.md` y `.gitignore`.

Verifica la instalación sin consumir tokens:

```powershell
rsc-vibe doctor
```

> **Si el proyecto ya tenía `.vibe/agents/developer.toml` generado por RSC:** `init` lo omite para no sobrescribirlo y `dispatch` bloqueará el envío por seguridad hasta que lo respaldes e instales la plantilla del bridge (respaldando el archivo previo y re-ejecutando `rsc-vibe init`).

---

## Uso diario

### 1. Consultar modelos disponibles en tiempo real
Define tu API key solo como variable de entorno de usuario (nunca en el repositorio ni en logs):

```powershell
[Environment]::SetEnvironmentVariable("MISTRAL_API_KEY", "<tu-clave>", "User")
```

Consulta los modelos activos en tu cuenta de Mistral:

```powershell
rsc-vibe models
```

### 2. Despachar una tarea a Vibe
```powershell
# Usando el modelo por defecto del tier
rsc-vibe dispatch --task issue-42 --tier balanced --prompt "Implementa el plan aprobado" --max-turns 6

# Eligiendo un modelo específico en tiempo real (conservando el perfil de seguridad del tier)
rsc-vibe dispatch --task issue-42 --tier balanced --model mistral-large-4 --prompt "Implementa el plan aprobado" --max-turns 6

# En un worktree aislado nuevo (requiere árbol Git limpio y commiteado)
rsc-vibe dispatch --task review-42 --tier heavy --prompt "Analiza la especificación" --worktree feat/review-42
```

### 3. Consultar estado e historial
```powershell
rsc-vibe status
```

---

## Routing por tier y modelos extra

| Tier | Modelo por defecto | Perfil Vibe | Permisos |
| --- | --- | --- | --- |
| `heavy` | `mistral-large-4` | `architect` | Solo lectura |
| `balanced` | `zai-glm-5-3-flash` | `developer` | Lectura y escritura acotada |
| `light` | `mistral-small-2603` | `tester` | Solo lectura |
| `debug` | `zai-glm-5-3` | `debugger` | Lectura y escritura acotada |

Con `--model <alias>` puedes sobreescribir el modelo del tier en cada corrida. Para usar modelos adicionales devueltos por `rsc-vibe models` (por ejemplo `deepseek-v4-1-flash-1017`), decláralos una sola vez dentro del arreglo `models = [ ... ]` de tu `~/.vibe/config.toml` global:

```toml
models = [
    { name = "deepseek-v4-1-flash-1017", alias = "deepseek-v4-1-flash-1017", provider = "mistral" },
]
```

---

## Seguridad y límites

- **Herramientas acotadas**: solo se habilitan `read_file`, `grep`, `write_file` y `edit`. `bash`/shell, subagentes, procesos en segundo plano y MCP quedan deshabilitados; el coordinador siempre ejecuta las pruebas.
- **Protección de gobierno**: `developer` y `debugger` no pueden escribir en `.rsc/`, `.git` ni `AGENTS.md`. `dispatch` rechaza perfiles o `config.toml` alterados y bloquea despachos directos sobre `main`/`master`.
- **Concurrencia y presupuesto**: máximo **2** ejecuciones simultáneas globales por usuario, límite de turnos (por defecto 8, máximo 20) y watchdog de tiempo (900–930 s). Nunca usa `--auto-approve`.
- **Privacidad de credenciales**: `models` lee únicamente `process.env.MISTRAL_API_KEY` en memoria y nunca la escribe en salidas, logs ni errores. El bridge nunca accede al keyring del sistema.

---

## Estado, logs y recuperación

- Estado global por usuario: `%LOCALAPPDATA%\RscVibeBridge\state.json` (con bloqueo exclusivo y renombrado atómico).
- Logs por corrida: `%LOCALAPPDATA%\RscVibeBridge\runs\<UUID>\` (`stdout.log`, `stderr.log`, `export.json`, `result.json`).
- Historial acotado a 100 entradas en `state.json`, conservando `result.json` por corrida.

---

## Verificación del bridge

```powershell
npm run check
npm test
```

Las pruebas usan `node:test` nativo con procesos Vibe simulados, estado temporal en disco y repositorios Git desechables, sin consumir inferencia.
