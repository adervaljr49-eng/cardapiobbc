# Black Barbecue - Cardápio Digital

Este é o projeto do cardápio digital do Black Barbecue, construído com React, Tailwind CSS e Vite.
O projeto foi arquitetado para ser uma aplicação **full-stack** de alta performance, sem dependência de bancos de dados externos como Firebase.

## Arquitetura

- **Frontend:** React (SPA) com Tailwind CSS para estilização premium.
- **Dados:** O cardápio e as configurações são carregados diretamente do servidor VPS (`/public/menu.json`).
- **Admin:** O painel de administração (`/admin`) gerencia os dados em tempo real. As alterações são enviadas para o servidor VPS via API, que as persiste em disco.
- **Persistência Real:** Todos os dados (pedidos, chamados, vendas e cardápio) são salvos em arquivos JSON no servidor VPS (`server_data.json` e `menu.json`), garantindo que sobrevivam a reinicializações.
- **Tempo Real:** Utiliza WebSockets para sincronização instantânea entre clientes e painel da cozinha.

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor de desenvolvimento (que também roda a API de salvamento):
   ```bash
   npm run dev
   ```
3. Acesse `http://localhost:3000` no seu navegador.

## Como usar o Painel Admin

1. Acesse a rota `/admin` (ex: `http://localhost:3000/admin`).
2. A senha padrão de acesso é **admin123**.
3. No painel, você pode:
   - Adicionar, editar e remover itens e categorias.
   - Reorganizar o cardápio.
   - **Importar Backup:** Você pode importar um arquivo JSON antigo. O sistema converterá automaticamente para o novo formato.
   - **Publicar Cardápio:** Salva as alterações locais diretamente no arquivo `public/menu.json` do servidor.
   - **Restaurar do Servidor:** Desfaz as alterações locais e recarrega os dados do `public/menu.json`.

## Deploy em VPS (Persistência 100%)

O projeto já está preparado para rodar em uma VPS (ex: DigitalOcean, AWS, Linode).

Para colocar em produção:

1. Clone o repositório na sua VPS.
2. Instale as dependências (`npm install`).
3. Faça o build do frontend:
   ```bash
   npm run build
   ```
4. Inicie o servidor de produção:
   ```bash
   npm start
   ```
   *(O comando `npm start` deve rodar o `server.ts` compilado ou via `tsx`, que servirá a pasta `dist` e a API `/api/save-backup`)*

**Importante sobre a VPS:**
Como o arquivo `menu.json` é salvo em disco, certifique-se de que o processo Node.js tenha permissão de escrita na pasta `public/` (ou `dist/` dependendo de como o build for configurado para servir os estáticos). O servidor atual (`server.ts`) já está configurado para salvar tanto na raiz `public/menu.json` quanto na pasta `dist/menu.json` se ela existir, garantindo que o cardápio atualize em tempo real sem precisar de um novo build.

## Estrutura de Pastas

- `/public/menu.json`: Fonte de verdade dos dados do cardápio.
- `/src/App.tsx`: Componente principal, contém a loja e o painel admin.
- `/src/services/dataService.ts`: Lida com o carregamento e salvamento de dados (localStorage e fetch do menu.json).
- `/server.ts`: Servidor Express que serve a aplicação e a API de salvamento.
