# Deploy do Backend no Railway

## Passo a Passo

### 1. Preparar o Projeto

Certifique-se de que todos os arquivos estão commitados no Git:

\`\`\`bash
git add .
git commit -m "Backend ready for deployment"
git push origin main
\`\`\`

### 2. Criar Projeto no Railway

1. Acesse [railway.app](https://railway.app)
2. Faça login com GitHub
3. Clique em "New Project"
4. Selecione "Deploy from GitHub repo"
5. Escolha seu repositório

### 3. Configurar Variáveis de Ambiente

No Railway, vá em "Variables" e adicione:

\`\`\`
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
FRONTEND_URL=https://seu-frontend.vercel.app
NODE_ENV=production
PORT=3001
\`\`\`

### 4. Configurar Build

O Railway detectará automaticamente o `package.json` e executará:
- `npm install`
- `npm run build`
- `npm start`

### 5. Domínio

O Railway fornecerá automaticamente um domínio:
- `https://seu-app.railway.app`

Copie este URL e configure no frontend como `NEXT_PUBLIC_BACKEND_URL`.

### 6. Verificar Logs

Monitore os logs no Railway para garantir que o servidor está rodando:

\`\`\`
[v0] Server running on port 3001
\`\`\`

### 7. Testar

1. Teste a saúde do servidor: `https://seu-app.railway.app/health`
2. Teste a criação de instâncias pela UI
3. Teste a conexão via QR code

## Troubleshooting

### Erro de memória
- Aumente o plano do Railway para ter mais RAM
- O whatsapp-web.js requer pelo menos 512MB de RAM

### Puppeteer não funciona
Certifique-se de que as flags do Puppeteer estão configuradas corretamente no código.

### Socket.IO não conecta
- Verifique se o CORS está configurado com o URL correto do frontend
- Certifique-se de que o Railway permite conexões WebSocket

## Monitoramento

- Use os logs do Railway para monitorar erros
- Configure alertas para quando o servidor cair
- Monitore o uso de memória e CPU

## Custos

Railway oferece:
- $5 de crédito grátis por mês
- Depois cobra por uso (RAM, CPU, largura de banda)

Para produção, considere:
- Railway Pro: $20/mês
- Ou migre para VPS (DigitalOcean, AWS, etc)
