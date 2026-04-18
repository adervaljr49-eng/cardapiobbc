# Deploying to VPS

1. Install Node.js (v18+) and PM2 (`npm install -g pm2`).
2. Install Nginx.
3. Clone the repository to your VPS.
4. Run `npm install`.
5. Run `npm run build`.
6. Configure Nginx (see `nginx.conf` below).
7. Start the backend with PM2: `pm2 start ecosystem.config.js`.
8. Ensure the `data` directory exists and is writable by the user running the app.

## `nginx.conf` Example

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        root /path/to/app/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## `ecosystem.config.js`

```javascript
module.exports = {
  apps: [{
    name: "black-barbecue-app",
    script: "server.ts",
    interpreter: "tsx",
    env: {
      NODE_ENV: "production",
      GEMINI_API_KEY: "SUA_CHAVE_AQUI",
      VAPID_PUBLIC_KEY: "BFUcyk-R2jg8JF-DXWLbaYeJpyio9ZAHsBcjoBdeCwDSi0iZowoxQJWKF8jx8f6TBng22Ke2vLQv3l3UZiOEKHU",
      VAPID_PRIVATE_KEY: "4gsV20KG6BQHAkeK9pZ8_RE1AfArMsKHNEd-NYsNnR8"
    }
  }]
}
```

## Environment Variables (.env)

Alternatively, create a `.env` file in the root directory:

```env
GEMINI_API_KEY=sua_chave_aqui
VAPID_PUBLIC_KEY=sua_chave_publica
VAPID_PRIVATE_KEY=sua_chave_privada
```
