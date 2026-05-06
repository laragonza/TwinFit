@echo off
title TwinFit Server Launcher
echo ===================================================
echo     Arrancando los servidores de TwinFit...
echo ===================================================
echo.

:: Comprobar si Deno está instalado
where deno >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] No encuentro Deno en tu ordenador.
    echo Por favor, instala Deno primero desde https://deno.land/
    echo Pulsa cualquier tecla para salir...
    pause >nul
    exit
)

:: Iniciar Backend en una nueva ventana oculta o minimizada
echo [INFO] Iniciando Backend en el puerto 4000...
start "TwinFit Backend" /MIN cmd /c "deno task backend"

:: Iniciar Frontend en otra ventana
echo [INFO] Iniciando Frontend en el puerto 4509...
start "TwinFit Frontend" /MIN cmd /c "deno task frontend"

:: Esperar un par de segundos para que los servidores levanten
timeout /t 3 /nobreak >nul

:: Abrir el navegador
echo [INFO] Abriendo la aplicacion en el navegador...
start http://127.0.0.1:4509/

echo.
echo ===================================================
echo [EXITO] TwinFit esta corriendo. 
echo Cierra las dos ventanas negras (Backend y Frontend)
echo minimizadas cuando termines de usar la aplicacion.
echo ===================================================
pause
