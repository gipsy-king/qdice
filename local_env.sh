#!/bin/bash
docker-compose stop nodice &
export $(cat .env | xargs)
export $(cat .local_env | xargs)
nodemon -e .ts -e .js -e .json main.ts
