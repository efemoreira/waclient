#!/bin/bash
# Script para diagnosticar problemas com tokens WhatsApp

echo "🔍 Diagnóstico WhatsApp - $(date)"
echo "================================"
echo ""

echo "📋 Verificando arquivo .env:"
if [ ! -f ".env" ]; then
    echo "❌ Arquivo .env não encontrado!"
    exit 1
fi

echo "✅ .env existe"
echo ""

echo "🔐 Tokens configurados:"
echo ""

# Verificar WHATSAPP_ACCESS_TOKEN
TOKEN=$(grep "^WHATSAPP_ACCESS_TOKEN=" .env | cut -d'=' -f2)
if [ -z "$TOKEN" ]; then
    echo "❌ WHATSAPP_ACCESS_TOKEN: NÃO CONFIGURADO"
else
    TOKEN_LENGTH=${#TOKEN}
    TOKEN_START="${TOKEN:0:10}"
    echo "✅ WHATSAPP_ACCESS_TOKEN: Presente (${TOKEN_LENGTH} caracteres)"
    echo "   Início: ${TOKEN_START}***"
fi
echo ""

# Verificar WHATSAPP_PHONE_NUMBER_ID
NUMBER_ID=$(grep "^WHATSAPP_PHONE_NUMBER_ID=" .env | cut -d'=' -f2)
if [ -z "$NUMBER_ID" ]; then
    echo "❌ WHATSAPP_PHONE_NUMBER_ID: NÃO CONFIGURADO"
else
    echo "✅ WHATSAPP_PHONE_NUMBER_ID: $NUMBER_ID"
fi
echo ""

# Verificar WHATSAPP_BUSINESS_ACCOUNT_ID
ACCOUNT_ID=$(grep "^WHATSAPP_BUSINESS_ACCOUNT_ID=" .env | cut -d'=' -f2)
if [ -z "$ACCOUNT_ID" ]; then
    echo "❌ WHATSAPP_BUSINESS_ACCOUNT_ID: NÃO CONFIGURADO"
else
    echo "✅ WHATSAPP_BUSINESS_ACCOUNT_ID: $ACCOUNT_ID"
fi
echo ""

# Verificar APP_PASSWORD
APP_PWD=$(grep "^APP_PASSWORD=" .env | cut -d'=' -f2)
if [ -z "$APP_PWD" ]; then
    echo "ℹ️  APP_PASSWORD: não configurado (proteção de autenticação desabilitada)"
else
    echo "✅ APP_PASSWORD: Configurado (${#APP_PWD} caracteres)"
fi
echo ""

echo "================================"
echo ""

# Sumário
if [ -z "$TOKEN" ]; then
    echo "🚨 PROBLEMA IDENTIFICADO:"
    echo "   WHATSAPP_ACCESS_TOKEN não está configurado"
    echo ""
    echo "📝 Para resolver, obtenha um novo token em:"
    echo "   https://developers.facebook.com/"
    echo ""
    echo "ℹ️  Depois adicione ao .env:"
    echo "   WHATSAPP_ACCESS_TOKEN=EAAIxxx..."
    exit 1
else
    echo "✅ Tokens parecem estar configurados!"
    echo ""
    echo "Se ainda receber erro 401, pode ser:"
    echo "1. Token expirado → regenere em Facebook Developer"
    echo "2. Token sem permissão → verifique permissões no System User"
    echo "3. Servidor não reiniciado → rode 'npm run dev' novamente"
    exit 0
fi
