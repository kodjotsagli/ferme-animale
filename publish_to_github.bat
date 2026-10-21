@echo off
chcp 65001 >nul
set GIT_CMD="C:\Users\LENOVO\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe"

echo ====================================================
echo  🌾 EXPORT DU PROJET AGRO-FERME SUR GITHUB
echo ====================================================
echo.
echo Votre dépôt local Git a déjà été initialisé et validé (commit initial prêt).
echo Les fichiers sensibles (.env) sont protégés par le fichier .gitignore.
echo.
set /p REPO_URL="Entrez l'URL de votre dépôt GitHub (ex: https://github.com/kodjotsagli-ai/agro-ferme.git) : "

if "%REPO_URL%"=="" (
    echo.
    echo [!] Aucune URL fournie. Annulation.
    pause
    exit /b
)

%GIT_CMD% remote remove origin 2>nul
%GIT_CMD% remote add origin %REPO_URL%
%GIT_CMD% branch -M main
echo.
echo Envoi du projet vers GitHub en cours...
%GIT_CMD% push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================================
    echo  ✅ SUCCÈS : Votre projet est en ligne sur GitHub !
    echo ====================================================
) else (
    echo.
    echo [X] Erreur lors de l'envoi. Vérifiez l'URL ou vos droits d'accès GitHub.
)
pause
