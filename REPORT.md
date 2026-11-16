# Entrega — rsc-vibe-bridge 1.0.0

**Estado: DONE_WITH_CONCERNS.** Implementación local terminada y verificada.
Rama: `feat/rsc-vibe-bridge`. No hay remoto, publicación ni merge.

## Inspección real

Windows nativo; Node 24.18.0; PowerShell 7.6.9; Git 2.55.0.windows.3;
Vibe 3.1.2; RSC catalogVersion 4.1.7.
Se ejecutó `vibe --help` antes del código. Flags confirmados:
`--prompt`, `--model`, `--max-turns`, `--output`, `--workdir`, `--output-dir`,
`--agent`, `--enabled-tools`, `--disabled-tools`, `--trust`, `--time-limit`,
`--max-price`, `--max-tokens`, `--prompt-file`, `--system-prompt-file`,
`--worktree`, `--add-dir`, además de los flags interactivos.
La salida completa está en [verification-vibe-help.txt](02-DOCS/wiki/sdd/verification-vibe-help.txt).

## Resultado y evidencia

CLI init/dispatch/status/doctor; cuatro tiers con los IDs solicitados; cinco perfiles;
estado global con bloqueo y reemplazo atómico; cupo máximo 2; máximo 20 turnos;
captura de salida y resultado permanente por ejecución; worktrees y limpieza segura.

Salida real de `npm test` (resumen; salida completa enlazada):

```text
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1844.1799
```

[Salida de npm test](02-DOCS/wiki/sdd/verification-tests.txt).
Incluye ocho procesos concurrentes compitiendo por dos cupos, fallos de spawn,
huérfanos, corrupción, perfiles permisivos, resultados/modelos y commits sin fusionar.

`npm run check` -> `Syntax checks passed`.
`node ./bin/cli.js doctor` -> salida JSON real con `DONE_WITH_CONCERNS`, exit 0,
los nueve controles locales `ok:true` y estas advertencias:

```text
Authentication and model entitlement not probed (no inference).
RSC hooks for Codex are not installed into Vibe; profiles carry instructions, not an OS sandbox.
```

[Salida íntegra de doctor](02-DOCS/wiki/sdd/verification-doctor.json).
Los 290 archivos originales de .rsc/ y .rsc.json conservan sus hashes SHA-256.
Los cinco TOML validaron contra los modelos Python del Vibe instalado sin sesión.
Tres revisores independientes aprobaron después de corregir los hallazgos.

Archivo npm: `rsc-vibe-bridge-1.0.0.tgz`, 16 entradas, 12.548 bytes,
SHA-1 `573367c385b1b1dc74ce5a34f55afa7d88329b12`.
Se instaló en un prefijo temporal local y su `rsc-vibe.cmd --help` devolvió el uso esperado.

## Lista exacta de archivos del entregable

Código, pruebas y documentación nuevos:

```text
.gitignore
package.json
README.md
REVIEW.md
REPORT.md
bin/cli.js
lib/process.js
lib/router.js
lib/init.js
lib/state.js
lib/worktree.js
lib/dispatcher.js
lib/doctor.js
scripts/check.js
scripts/helpers.js
scripts/slot-worker.js
templates/config.toml
templates/agents/architect.toml
templates/agents/developer.toml
templates/agents/debugger.toml
templates/agents/reviewer.toml
templates/agents/tester.toml
test/router-init.test.js
test/state.test.js
test/worktree.test.js
test/dispatcher.test.js
01-TOOLS/vibe-bridge/.gitignore
01-TOOLS/vibe-bridge/README.md
01-TOOLS/vibe-bridge/models.json
02-DOCS/wiki/index.md
02-DOCS/wiki/sdd/config.yaml
02-DOCS/wiki/sdd/decisions.md
02-DOCS/wiki/sdd/specs/rsc-vibe-bridge.md
02-DOCS/wiki/sdd/plans/rsc-vibe-bridge.md
02-DOCS/wiki/sdd/analysis/rsc-vibe-bridge.md
02-DOCS/wiki/sdd/progress/rsc-vibe-bridge.md
02-DOCS/wiki/sdd/reviews/rsc-vibe-bridge.md
02-DOCS/wiki/sdd/verifications/rsc-vibe-bridge-2026-11-16.md
02-DOCS/wiki/sdd/verification-tests.txt
02-DOCS/wiki/sdd/verification-doctor.json
02-DOCS/wiki/sdd/verification-vibe-help.txt
```

Modificado: `02-DOCS/wiki/sdd/constitution.md`, completando el borrador de onboarding.
Generados locales, ignorados por Git:

```text
.vibe/config.toml
.vibe/agents/architect.toml
.vibe/agents/developer.toml
.vibe/agents/debugger.toml
.vibe/agents/reviewer.toml
.vibe/agents/tester.toml
.vibe/bridge-backups/initial-generated/config.toml
.vibe/bridge-backups/initial-generated/agents/architect.toml
.vibe/bridge-backups/initial-generated/agents/developer.toml
.vibe/bridge-backups/initial-generated/agents/debugger.toml
.vibe/bridge-backups/initial-generated/agents/reviewer.toml
.vibe/bridge-backups/initial-generated/agents/tester.toml
rsc-vibe-bridge-1.0.0.tgz
```

También se creó metadata Git por autorización expresa. `.test-tmp/` contiene
baselines de hashes, scripts de validación y prefijos npm de prueba; es temporal,
ignorado y ajeno al paquete. No se modificó ningún archivo original de RSC.

## Riesgos y límites

- Sin inferencia real: no se confirmó autenticación, disponibilidad ni acceso
  Education a los cuatro modelos. Los presets fijan IDs, pero no crean permisos.
  El export registra el modelo resuelto; si difiere, conserva fallos y añade concerns.
- El límite cubre dos procesos Vibe gestionados por el bridge por usuario Windows.
  No controla instancias externas. Subagentes y herramientas shell están desactivados;
  las pruebas del trabajo generado se ejecutan desde el terminal del desarrollador.
- Los perfiles protegen herramientas de archivo; no son aislamiento de sistema
  operativo ni reproducen los hooks Codex de RSC. Nunca se usa auto-approve.
- Un escritor muerto puede dejar un bloqueo o reserva ambigua. Se conserva el cupo
  hasta inspección manual para evitar liberar un proceso todavía vivo. El README
  describe recuperación con respaldo y comprobación de procesos.
- Node 24 probado; Node >=18 declarado, sin matriz de versiones antiguas ejecutada.
  No CI, remoto, publicación o instalación global. La limpieza de worktrees es API
  explícita documentada; nunca borra trabajo sucio o no fusionado.

## Uso inmediato

```powershell
node ./bin/cli.js doctor
node ./bin/cli.js status
node ./bin/cli.js dispatch --task tarea-1 --tier balanced --prompt "Implementa la especificación aprobada" --max-turns 8
```

El tercer comando sí usa el modelo y puede consumir cuota; no se ejecutó durante
esta entrega. Ver [README](README.md) para rutas, recuperación y reversión.

Commits funcionales: f5cd0d7, 7e94516, 8560f4d, fef9dee, 20e1b54.
La primera unidad tiene 412 líneas; antes de abrir PR se recomienda size:exception
para esa unidad de inicialización y sus cinco perfiles, o dividirla con el mantenedor.
No se ha creado ningún PR ni se solicita autorización para publicar.
