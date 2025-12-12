# INSTRUÇÕES IMPORTANTES

## Como subir corretamente no GitHub:

1. No v0, clique nos 3 pontinhos (...) no canto superior direito
2. Clique em "Download ZIP"
3. Extraia o ZIP
4. Vá na pasta `backend/`
5. Delete TUDO no repositório GitHub `novo-baileys-webb-nosso`
6. Suba TODOS os arquivos da pasta `backend/` para a RAIZ do repositório

## Estrutura que deve ficar no GitHub:

\`\`\`
novo-baileys-webb-nosso/
├── package.json
├── tsconfig.json
├── railway.toml
├── Procfile
├── README.md
├── DEPLOY.md
├── LEIA-ISSO.md
└── src/
    ├── server.ts
    ├── config/
    │   ├── env.ts
    │   └── supabase.ts
    ├── middleware/
    │   └── auth.ts
    ├── routes/
    │   ├── instances.ts
    │   ├── messages.ts
    │   ├── dashboard.ts
    │   └── webhooks.ts
    └── whatsapp/
        └── clientManager.ts
\`\`\`

## Variáveis no Railway:

- SUPABASE_URL=https://jjywkbaqukbexnpsdpcf.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=sua-key-aqui
- FRONTEND_URL=https://3333-versao.vercel.app
- PORT=3001
- NODE_ENV=production
