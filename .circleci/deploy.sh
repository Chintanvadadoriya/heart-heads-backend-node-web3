#!/bin/bash -i
set -e
pwd
cd ~/HexToys/HexToys-Backend
git restore .

git pull origin main

npm install 
pm2 restart app 
