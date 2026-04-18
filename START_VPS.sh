#!/bin/bash
# Script para iniciar o sistema na VPS

echo "Instalando dependências..."
npm install

echo "Gerando Build..."
npm run build

echo "Iniciando o servidor..."
npm start
