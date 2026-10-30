@echo off
cd /d C:\Users\anubh\gps-bus-tracking-system
git config user.name "anubhavpandey2416-hue"
git config user.email "anubhavpandey2416-hue@users.noreply.github.com"
git add .
git commit -m "Initial commit"
gh repo create gps-bus-tracking-system --public --source=. --remote=origin --push --description "GPS Bus Tracking System"
