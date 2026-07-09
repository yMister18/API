# Warpion API

API backend da plataforma web do Warpion (comunidade, loja, fórum, suporte,
rankings, dashboard de jogador). Construída em Node.js + TypeScript, Fastify
e PostgreSQL via Prisma.

## Stack

- **Runtime**: Node.js 20+ / TypeScript
- **Framework HTTP**: [Fastify](https://fastify.dev)
- **Base de dados**: PostgreSQL
- **ORM**: [Prisma](https://www.prisma.io)
- **Autenticação**: Discord OAuth2 (Authorization Code Grant) + sessão JWT em cookie httpOnly
- **Validação**: [Zod](https://zod.dev)
- **Documentação**: OpenAPI/Swagger em `/docs`

## Estrutura do projeto

```
warpion-api/
├─ prisma/
│  ├─ schema.prisma        # schema da base de dados
│  └─ seed.ts               # dados de demonstração
├─ src/
│  ├─ config/env.ts         # validação de variáveis de ambiente (zod)
│  ├─ lib/                  # prisma client, helpers (rank, iniciais, paginação, serializers)
│  ├─ plugins/auth.ts       # jwt + cookie + discord oauth2 + decorators authenticate/requireStaff
│  ├─ types/fastify.d.ts    # augmentação de tipos do Fastify (request.currentUser, etc.)
│  ├─ modules/
│  │  ├─ auth/               # /auth/discord, /auth/discord/callback, /auth/logout, /auth/me
│  │  ├─ profile/             # /me/profile, /me/missions, /me/achievements, ...
│  │  ├─ forum/                # /forum/categories, /forum/categories/:slug/topics, ...
│  │  ├─ tickets/              # /me/tickets, /tickets/:id, /staff/tickets, ...
│  │  ├─ shop/                 # /shop/items, /me/cart, /checkout
│  │  ├─ content/              # /news, /events, /team, /rankings/*, /gallery, /faq, /bans, /vote-sites
│  │  ├─ contact/              # POST /contact
│  │  └─ internal/             # /internal/* (webhooks/sync protegidos por API key)
│  ├─ app.ts                 # composição da app Fastify (plugins + rotas)
│  └─ server.ts               # ponto de entrada (listen)
├─ .env.example
└─ package.json
```

## Setup local

### 1. Pré-requisitos

- Node.js 20+
- PostgreSQL a correr localmente (ou usa Docker — ver abaixo)
- Uma aplicação Discord criada em https://discord.com/developers/applications
  com um redirect URI igual a `DISCORD_CALLBACK_URL`
  (por omissão: `http://localhost:3333/auth/discord/callback`)

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preenche `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` e gera
valores aleatórios fortes para `JWT_SECRET`, `COOKIE_SECRET` e
`INTERNAL_API_KEY` (ex: `openssl rand -hex 32`).

### 4. Base de dados (opção rápida com Docker)

```bash
docker run --name warpion-postgres -e POSTGRES_USER=warpion -e POSTGRES_PASSWORD=warpion -e POSTGRES_DB=warpion -p 5432:5432 -d postgres:16
```

### 5. Correr migrations e seed

```bash
npm run prisma:migrate   # cria as tabelas (pede um nome de migration na primeira vez)
npm run seed              # popula dados de demonstração
```

### 6. Arrancar em desenvolvimento

```bash
npm run dev
```

A API fica disponível em `http://localhost:3333`, com documentação Swagger
em `http://localhost:3333/docs`.

### Build de produção

```bash
npm run build
npm start
```

Em produção, usa `npm run prisma:deploy` para aplicar migrations (não
`prisma:migrate`, que é interativo e pensado para desenvolvimento).

## Autenticação

1. O frontend redireciona o utilizador para `GET /auth/discord`.
2. O Discord redireciona de volta para `GET /auth/discord/callback`, que
   troca o código por um token, obtém o perfil Discord, faz upsert do
   `User` local e define um cookie httpOnly `warpion_session` (JWT, 30 dias).
3. O utilizador é redirecionado para `FRONTEND_URL`.
4. `GET /auth/me` devolve o utilizador autenticado (401 se não houver sessão
   válida).
5. `POST /auth/logout` limpa o cookie de sessão.

Rotas protegidas usam o preHandler `fastify.authenticate` (401 se não
autenticado). Ações de staff usam adicionalmente `fastify.requireStaff`
(403 se autenticado mas sem `staffRole`).

## Rotas internas (`/internal/*`)

Protegidas por header `x-internal-api-key` (não usam sessão de utilizador).
Pensadas para o plugin do servidor Minecraft:

- `POST /internal/purchase-fulfilled` — marca uma entrega (`PendingDelivery`)
  como entregue depois do plugin aplicar o item/rank ao jogador in-game.
- `GET /internal/deliveries/pending` — lista entregas por processar.
- `POST /internal/sync/rankings/players` / `/wealth` / `/clans` — substitui
  os rankings correntes pelos dados enviados pelo servidor de jogo.
- `POST /internal/sync/online-status` — atualiza `User.isOnline` por
  `minecraftUsername` (usado para `Friend.online` e `TeamMember.online`).

## Desvios face aos tipos TypeScript originais do frontend

Sinalizados aqui conforme pedido, para ajuste do frontend:

1. **`ShopItem.price` → `priceCents` (number) + `currency` ("EUR")**
   Os mocks guardavam o preço como string já formatada (`"€9.99"`). A API
   devolve `priceCents: number` (ex: `999`) e `currency: string` (ex:
   `"EUR"`); o frontend deve formatar com `Intl.NumberFormat`. O mesmo se
   aplica a `originalPrice` → `originalPriceCents`.

2. **`ForumTopic` na listagem (`GET /forum/categories/:slug/topics`)**
   não inclui `replies` completas (o campo vem como `[]`) — inclui em vez
   disso `replyCount: number`. O tópico completo com todas as `replies`
   só é devolvido em `GET /forum/categories/:slug/topics/:topicId`. Isto
   segue explicitamente a sugestão do pedido original ("sem replies
   completas, só preview/último post"), mas nota que o campo `replies`
   fica vazio em vez de omitido, para não quebrar o tipo `ForumTopic`.

3. **`Mission.expiresInHours`** é calculado a pedido a partir de um campo
   `expiresAt` (DateTime) guardado na base de dados — não é persistido
   diretamente, para evitar ficar desatualizado.

4. **`PlayerProfile.rank`** (ex: `"Veterano"`) é derivado do `level` do
   jogador através de uma tabela de níveis em `src/lib/rank.ts`, não é um
   campo da base de dados.

5. **`GalleryImage`, `EventItem.status`, `RankPlayer.value`, etc.** —
   mantidos exatamente como no frontend (strings livres/pré-formatadas),
   já que estes dados são tipicamente sincronizados por staff/plugin, não
   introduzem o mesmo problema de formatação de moeda que o `ShopItem`.

6. **Endpoints paginados** (`/me/activity`, `/news`, `/bans`) devolvem
   `{ data, page, pageSize, total? }` em vez de um array simples, para
   suportar paginação no frontend.

## Pontos de extensão (fora do âmbito deste MVP)

- **Pagamento real no `/checkout`**: atualmente cria a encomenda como já
  "paga" e devolve um `checkoutUrl` fictício (`https://checkout.stub.warpion.pt/orders/:id`).
  Substituir por integração real (Stripe, MB Way, etc.) antes de produção.
- **Plugin do servidor Minecraft**: consome `/internal/purchase-fulfilled`,
  `/internal/deliveries/pending` e empurra dados via `/internal/sync/*`.
- **Ashion (assistente de suporte automático)**: só existe o valor
  `author: 'ashion'` em `TicketMessage` — a lógica de resposta automática
  não está implementada.
- **Envio de email no `/contact`**: mensagens são apenas persistidas em BD
  (`ContactMessage`) para consulta pela staff.

## Scripts disponíveis

| Script                  | Descrição                                    |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | Arranca em modo desenvolvimento (tsx watch)   |
| `npm run build`          | Compila TypeScript para `dist/`               |
| `npm start`              | Corre a build de produção                     |
| `npm run prisma:migrate` | Cria/aplica migrations em desenvolvimento      |
| `npm run prisma:deploy`  | Aplica migrations em produção                  |
| `npm run prisma:studio`  | Abre o Prisma Studio (explorador de BD)        |
| `npm run seed`           | Popula a base de dados com dados de demo       |
| `npm run typecheck`      | Verifica tipos sem gerar output                |
