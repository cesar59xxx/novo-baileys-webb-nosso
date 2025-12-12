# WhatsApp SaaS Backend

Backend API para WhatsApp SaaS construído com Node.js, Express e **Baileys** (conexão leve sem Chromium).

## 🚀 Deploy Rápido no Railway

### Variáveis Necessárias:

\`\`\`env
SUPABASE_URL=https://jjywkbaqukbexnpsdpcf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_do_supabase
FRONTEND_URL=https://seu-projeto.vercel.app
PORT=3001
NODE_ENV=production
\`\`\`

**Como pegar a Service Role Key:**
1. Acesse: https://supabase.com/dashboard/project/jjywkbaqukbexnpsdpcf/settings/api
2. Copie a "Service Role Key" (clique no olho para revelar)

---

## ⚡ Sobre o Baileys

Este backend usa **@whiskeysockets/baileys** em vez de whatsapp-web.js porque:
- **Não precisa de Chromium/Puppeteer** - Build muito mais rápido
- **Conexão direta via WebSocket** - Mais leve e eficiente
- **Compatível com Railway** - Deploy em 2-3 minutos

---

## 📦 Setup Local

1. Instalar dependências:
\`\`\`bash
npm install
\`\`\`

2. Copiar `.env.example` para `.env`:
\`\`\`bash
cp .env.example .env
\`\`\`

3. Preencher as variáveis no `.env`

4. Rodar em desenvolvimento:
\`\`\`bash
npm run dev
\`\`\`

5. Build para produção:
\`\`\`bash
npm run build
npm start
\`\`\`

---

## 🔌 API Endpoints

### Autenticação
Todos os endpoints (exceto webhooks) requerem Bearer token no header Authorization.

### Instâncias WhatsApp
- `POST /api/instances` - Criar nova instância
- `POST /api/instances/:id/start` - Iniciar instância e gerar QR
- `POST /api/instances/:id/stop` - Parar instância
- `POST /api/instances/:id/logout` - Desconectar e limpar sessão
- `GET /api/instances` - Listar todas as instâncias
- `GET /api/instances/:id/status` - Status da instância
- `GET /api/instances/:id/contacts` - Contatos da instância

### Mensagens
- `GET /api/instances/:instanceId/chats/:contactId/messages` - Histórico de mensagens
- `POST /api/instances/:instanceId/messages` - Enviar mensagem

### Dashboard
- `GET /api/dashboard?projectId=xxx` - Métricas diárias

### Webhooks
- `POST /api/webhooks/sales` - Registrar evento de venda

### Health Check
- `GET /health` - Verificar status do servidor

---

## 🔄 Eventos Socket.IO

### Emitidos pelo servidor:
- `qr` - QR code gerado (base64 image)
- `instance_status` - Status da instância mudou
- `message_received` - Nova mensagem recebida

---

## 📁 Arquitetura

\`\`\`
backend/
├── src/
│   ├── config/         # Configuração (env, supabase)
│   ├── whatsapp/       # ClientManager com Baileys
│   ├── routes/         # Rotas da API
│   ├── middleware/     # Auth middleware
│   └── server.ts       # Servidor Express + Socket.IO
├── auth_sessions/      # Sessões do Baileys (criado automaticamente)
├── package.json
├── railway.toml        # Config do Railway
└── tsconfig.json
\`\`\`

---

## 🐛 Troubleshooting

**Backend não inicia:**
- Verifique se todas as variáveis de ambiente estão configuradas
- Verifique se o Supabase está acessível

**QR Code não aparece:**
- Aguarde alguns segundos após iniciar a instância
- Verifique os logs do Socket.IO no console

**Mensagens não chegam:**
- Verifique se a instância está com status "CONNECTED"
- Verifique se o número está correto (formato internacional)

**Reconexão automática:**
- O Baileys reconecta automaticamente se a conexão cair
- Se o usuário fizer logout no celular, a sessão é limpa automaticamente
