@echo off
chcp 65001 >nul
set GIT_CMD="C:\Users\LENOVO\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe"

echo ====================================================
echo  🚀 ENVOI DES DERNIERES MISES A JOUR VERS GITHUB
echo ====================================================
echo.
echo Envoi en cours vers https://github.com/kodjotsagli/ferme-animale.git ...
%GIT_CMD% push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================================
    echo  ✅ SUCCES : Votre projet est synchronise sur GitHub !
    echo ====================================================
) else (
    echo.
    echo ℹ️ Si besoin, ouvrez GitHub Desktop et cliquez sur 'Push origin'.
)
echo.
pause
