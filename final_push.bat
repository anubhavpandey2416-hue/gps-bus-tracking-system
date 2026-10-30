@echo off
cd /d C:\Users\anubh\gps-bus-tracking-system
del /q push_to_github.bat repo-remote.txt repo-view.json status.txt git-push.log git-push-final.log 2>nul
git branch -M main
git add .
git commit -m "Add GPS bus tracking app"
git push -u origin main
