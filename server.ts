import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import webpush from "web-push";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import archiver from "archiver";

// Load environment variables from .env file
dotenv.config();

// VAPID keys for push notifications
const vapidPublicKey = 'BFUcyk-R2jg8JF-DXWLbaYeJpyio9ZAHsBcjoBdeCwDSi0iZowoxQJWKF8jx8f6TBng22Ke2vLQv3l3UZiOEKHU';
const vapidPrivateKey = '4gsV20KG6BQHAkeK9pZ8_RE1AfArMsKHNEd-NYsNnR8';

try {
  webpush.setVapidDetails(
    'mailto:admin@example.com',
    vapidPublicKey,
    vapidPrivateKey
  );
} catch (error) {
  console.warn("Failed to set VAPID details. Push notifications will be disabled.", error);
}

// Data persistence paths
const DATA_DIR = path.join(process.cwd(), "data");
const MENU_FILE = path.join(DATA_DIR, "menu.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const COMPLETED_ORDERS_FILE = path.join(DATA_DIR, "completed-orders.json");
const MANUAL_SALES_FILE = path.join(DATA_DIR, "manual-sales.json");
const WAITER_CALLS_FILE = path.join(DATA_DIR, "waiter-calls.json");
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "subscriptions.json");
const BACKUP_FILE = path.join(process.cwd(), "user_backup.json");
const CUSTOM_LOGO_FILE = path.join(process.cwd(), "public", "custom-logo.png");

// Legacy paths for migration
const LEGACY_MENU_FILE = path.join(process.cwd(), "public", "menu.json");
const ROOT_MENU_FILE = path.join(process.cwd(), "menu.json");
const LEGACY_PERSISTENCE_FILE = path.join(process.cwd(), "server_data.json");

// In-memory data with persistence
let waiterCalls: any[] = [];
let activeOrders: any[] = [];
let completedOrders: any[] = [];
let manualSales: any[] = [];
let subscriptions: any[] = [];
let menuData: any = { categories: [], menuItems: [] };
let settings: any = {};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

try {
  const testFile = path.join(DATA_DIR, ".write-test");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);
  console.log("Data directory is writable");
} catch (e) {
  console.error("CRITICAL ERROR: Data directory is NOT writable! Check permissions on your VPS.", e);
}

// Helper to load JSON safely
const loadJson = (filePath: string, defaultValue: any) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
  }
  return defaultValue;
};

// Helper to save JSON safely
const saveJson = (filePath: string, data: any) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
  }
};

// Helper to normalize and deduplicate categories
const normalizeCategoryName = (name: string): string => {
  if (!name) return "";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Map to standard names with emojis
  const mapping: { [key: string]: string } = {
    'entradas': '🔥 Entradas',
    'pratos principais': '🥩 Pratos Principais',
    'prato principal': '🥩 Pratos Principais',
    'pratos': '🥩 Pratos Principais',
    'refeições': '🥩 Refeições',
    'refeição': '🥩 Refeições',
    'churrasco': '🔥 Churrasco',
    'massas': '🍝 Massas',
    'frutos do mar': '🐟 Frutos do Mar',
    'lanches': '🍔 Lanches',
    'drinks': '🍹 Drinks',
    'cervejas': '🍺 Cervejas',
    'vinhos': '🍷 Vinhos',
    'destilados': '🥃 Destilados',
    'bebidas não alcoólicas': '🥤 Bebidas Não Alcoólicas',
    'bebidas nao alcoolicas': '🥤 Bebidas Não Alcoólicas',
    'bebida não alcoólica': '🥤 Bebidas Não Alcoólicas',
    'bebidas': '🥤 Bebidas Não Alcoólicas',
    'cafés': '☕ Cafés',
    'cafes': '☕ Cafés',
    'sobremesas': '🍰 Sobremesas',
    'mais vendidos': '⭐ Mais Vendidos',
    'promoções': '🔥 Promoções',
    'promocoes': '🔥 Promoções',
    'para compartilhar': '👨‍👩‍👧 Para Compartilhar'
  };

  const cleanName = trimmed.replace(/[^\w\sà-úÀ-Ú]/g, '').trim().toLowerCase();

  for (const [key, value] of Object.entries(mapping)) {
    const cleanKey = key.replace(/[^\w\sà-úÀ-Ú]/g, '').trim().toLowerCase();
    
    // Exact matches or if the input contains the exact key
    if (lower === key || lower.includes(key) || cleanName === cleanKey || cleanName.includes(cleanKey)) {
      return value;
    }
  }

  return trimmed;
};

const normalizeCategories = (categories: any[]) => {
  if (!Array.isArray(categories)) return [];
  const uniqueNames = new Set<string>();
  return categories
    .filter(cat => {
      if (!cat || !cat.name) return false;
      
      // Clean the name
      cat.name = normalizeCategoryName(cat.name);
      
      // Remove unwanted auto-generated inactive categories
      if (cat.id?.startsWith('auto-') && cat.active === false) return false;
      
      const cleanName = cat.name.trim().toLowerCase();
      if (uniqueNames.has(cleanName)) return false;
      
      uniqueNames.add(cleanName);
      return true;
    });
};

// Migration logic
const migrateData = () => {
  let migrated = false;

  // Migrate from server_data.json
  if (fs.existsSync(LEGACY_PERSISTENCE_FILE)) {
    console.log("Migrating from server_data.json...");
    const legacyData = loadJson(LEGACY_PERSISTENCE_FILE, {});
    if (legacyData.waiterCalls) saveJson(WAITER_CALLS_FILE, legacyData.waiterCalls);
    if (legacyData.activeOrders) saveJson(ORDERS_FILE, legacyData.activeOrders);
    if (legacyData.completedOrders) saveJson(COMPLETED_ORDERS_FILE, legacyData.completedOrders);
    if (legacyData.manualSales) saveJson(MANUAL_SALES_FILE, legacyData.manualSales);
    if (legacyData.subscriptions) saveJson(SUBSCRIPTIONS_FILE, legacyData.subscriptions);
    
    fs.renameSync(LEGACY_PERSISTENCE_FILE, LEGACY_PERSISTENCE_FILE + ".bak");
    migrated = true;
  }

  // Migrate from public/menu.json
  if (fs.existsSync(LEGACY_MENU_FILE)) {
    console.log("Migrating from public/menu.json...");
    const legacyMenu = loadJson(LEGACY_MENU_FILE, {});
    
    let items = [];
    let cats = [];
    
    if (Array.isArray(legacyMenu)) {
      items = legacyMenu;
    } else {
      items = legacyMenu.menuItems || [];
      cats = legacyMenu.categories || [];
    }

    if (items.length > 0) {
      saveJson(MENU_FILE, { 
        categories: cats, 
        menuItems: items 
      });
      if (!Array.isArray(legacyMenu) && legacyMenu.settings) {
        saveJson(SETTINGS_FILE, legacyMenu.settings);
      }
      migrated = true;
    }
    
    fs.renameSync(LEGACY_MENU_FILE, LEGACY_MENU_FILE + ".bak");
  }

  // Migrate from menu.json in root
  if (fs.existsSync(ROOT_MENU_FILE)) {
    console.log("Migrating from root menu.json...");
    const rootMenu = loadJson(ROOT_MENU_FILE, {});
    
    let items = [];
    let cats = [];
    
    if (Array.isArray(rootMenu)) {
      items = rootMenu;
    } else {
      items = rootMenu.menuItems || [];
      cats = rootMenu.categories || [];
    }

    if (items.length > 0) {
      saveJson(MENU_FILE, { 
        categories: cats, 
        menuItems: items 
      });
      migrated = true;
    }
    
    fs.renameSync(ROOT_MENU_FILE, ROOT_MENU_FILE + ".bak");
  }

  // Migrate from user_backup.json if data directory is empty
  if (fs.existsSync(BACKUP_FILE) && (!fs.existsSync(MENU_FILE) || loadJson(MENU_FILE, {}).menuItems?.length === 0)) {
    console.log("Restoring from user_backup.json...");
    const backup = loadJson(BACKUP_FILE, {});
    if (backup.data) {
      saveJson(MENU_FILE, {
        menuItems: backup.data.menuItems || [],
        categories: backup.data.categories || []
      });
      if (backup.data.settings) {
        saveJson(SETTINGS_FILE, backup.data.settings);
      }
      migrated = true;
    }
  }

  if (migrated) console.log("Migration/Restore completed.");
};

// Initial load
const loadAllData = () => {
  migrateData();
  waiterCalls = loadJson(WAITER_CALLS_FILE, []);
  activeOrders = loadJson(ORDERS_FILE, []);
  completedOrders = loadJson(COMPLETED_ORDERS_FILE, []);
  manualSales = loadJson(MANUAL_SALES_FILE, []);
  subscriptions = loadJson(SUBSCRIPTIONS_FILE, []);
  menuData = loadJson(MENU_FILE, { categories: [], menuItems: [] });
  settings = loadJson(SETTINGS_FILE, {});
  
  // Normalize loaded categories
  if (settings.categories) {
    settings.categories = normalizeCategories(settings.categories);
  }
  if (menuData.categories) {
    menuData.categories = normalizeCategories(menuData.categories);
  }
  
  console.log(`All data loaded. Menu items: ${menuData.menuItems?.length || 0}`);
};

// Initial load removed from top-level to ensure it runs inside startServer
// loadAllData();

// Gemini AI Setup
let aiClient: GoogleGenAI | null = null;
const getAiClient = (): GoogleGenAI => {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6KJCBCj62Z5siDUSpB_2TKTgP2cHajVcEtOrtY2sWadWQ';
    if (!key || key.trim() === '') {
      throw new Error('A chave GEMINI_API_KEY não foi encontrada nas variáveis de ambiente. Por favor, configure-a no painel do AI Studio ou no arquivo .env do seu servidor VPS.');
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
};

const getSystemInstruction = () => `
Você é o "Pitmaster AI", o mestre churrasqueiro e anfitrião do restaurante "Black Barbecue".
Seu tom é rústico, amigável, confiante e apaixonado.
Sua missão é guiar o cliente pelo nosso cardápio de petiscos gourmet (Entradas) e bebidas premium.

Aqui está o cardápio oficial:
${JSON.stringify(menuData.menuItems)}

Regras de Ouro:
1. Responda SEMPRE em Português do Brasil.
2. Seja direto e use termos gastronômicos atraentes como "crocância", "suavidade", "toque cítrico".
3. Sugira harmonizações: Por exemplo, o Bolinho de Bacalhau combina perfeitamente com uma Heineken gelada. As Iscas de Filé vão muito bem com um Vinho Reservado ou uma Budweiser.
4. Itens populares: Bolinho de Bacalhau, Batata Frita com Calabresa, Coca Cola 2L e Heineken são os sucessos garantidos.
5. Se o cliente perguntar algo que não está no cardápio, diga educadamente que o foco é na qualidade do que está servido hoje.
`;

async function startServer() {
  console.log(`Starting server with Node ${process.version}`);
  loadAllData();
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('connection', (ws: any) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });

  const PORT = 3000;

  // Broadcast to all connected clients
  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  app.use(cors());
  app.use(express.json({ limit: '100mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Menu API
  app.get("/api/menu", (req, res) => {
    res.json(menuData);
  });

  app.post("/api/menu", (req, res) => {
    try {
      menuData = req.body;
      
      // Normalize categories list
      if (menuData.categories) {
        menuData.categories = normalizeCategories(menuData.categories);
      }
      
      // Normalize item categories
      if (Array.isArray(menuData.menuItems)) {
        menuData.menuItems = menuData.menuItems.map((item: any) => {
          if (item.category) item.category = normalizeCategoryName(item.category);
          if (Array.isArray(item.categories)) {
            item.categories = item.categories.map((c: string) => normalizeCategoryName(c));
          }
          return item;
        });
      }

      saveJson(MENU_FILE, menuData);
      broadcast({ type: 'MENU_UPDATED' });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving menu:", error);
      res.status(500).json({ success: false });
    }
  });

  // API route to save or update single menu item
  app.post("/api/menu/item/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updatedItem = req.body;
      let itemExists = false;
      if (Array.isArray(menuData.menuItems)) {
        menuData.menuItems = menuData.menuItems.map((item: any) => {
          if (item.id === id) {
            itemExists = true;
            const mergedItem = { ...item, ...updatedItem, id }; // Garante merge e preserva o ID
            if (mergedItem.category) mergedItem.category = normalizeCategoryName(mergedItem.category);
            if (Array.isArray(mergedItem.categories)) {
               mergedItem.categories = mergedItem.categories.map((c: string) => normalizeCategoryName(c));
            }
            return mergedItem;
          }
          return item;
        });

        if (!itemExists) {
            if (updatedItem.category) updatedItem.category = normalizeCategoryName(updatedItem.category);
            if (Array.isArray(updatedItem.categories)) {
               updatedItem.categories = updatedItem.categories.map((c: string) => normalizeCategoryName(c));
            }
            menuData.menuItems.push(updatedItem);
        }
      } else {
         menuData.menuItems = [updatedItem];
      }

      saveJson(MENU_FILE, menuData);
      broadcast({ type: 'MENU_UPDATED' });
      res.json({ success: true, message: "Item salvo com sucesso!" });
    } catch (error) {
      console.error("Error saving single menu item:", error);
      res.status(500).json({ success: false, error: "Erro ao salvar item individual." });
    }
  });

  // API route to delete single menu item
  app.delete("/api/menu/item/:id", (req, res) => {
    try {
      const { id } = req.params;
      if (Array.isArray(menuData.menuItems)) {
        menuData.menuItems = menuData.menuItems.filter((item: any) => item.id !== id);
      }
      saveJson(MENU_FILE, menuData);
      broadcast({ type: 'MENU_UPDATED' });
      res.json({ success: true, message: "Item excluído com sucesso!" });
    } catch (error) {
      console.error("Error deleting single menu item:", error);
      res.status(500).json({ success: false, error: "Erro ao excluir item individual." });
    }
  });

  // API route to sort menu items
  app.post("/api/menu/order", (req, res) => {
    try {
      const { order } = req.body;
      if (Array.isArray(order) && Array.isArray(menuData.menuItems)) {
        const orderMap = new Map();
        order.forEach((id: string, index: number) => orderMap.set(id, index));
        
        menuData.menuItems.sort((a: any, b: any) => {
          const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 99999;
          const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 99999;
          return indexA - indexB;
        });
        
        saveJson(MENU_FILE, menuData);
        broadcast({ type: 'MENU_UPDATED' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error sorting menu items:", error);
      res.status(500).json({ success: false, error: "Erro ao ordernar menu." });
    }
  });

  // Settings API
  app.get("/api/settings", (req, res) => {
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    try {
      console.log("Received settings update:", req.body);
      settings = req.body;
      if (settings.categories) {
        settings.categories = normalizeCategories(settings.categories);
      }
      saveJson(SETTINGS_FILE, settings);
      broadcast({ type: 'SETTINGS_UPDATED' });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ success: false });
    }
  });

  // API route to get full system backup
  app.get("/api/get-full-backup", (req, res) => {
    try {
      const fullBackup = {
        menuItems: menuData.menuItems,
        categories: menuData.categories,
        settings,
        activeOrders,
        completedOrders,
        manualSales,
        waiterCalls,
        subscriptions
      };
      res.json({ success: true, data: fullBackup });
    } catch (error) {
      console.error("Error getting full backup:", error);
      res.status(500).json({ success: false, error: "Erro ao gerar backup completo." });
    }
  });

  // API route to get backup
  app.get("/api/get-backup", (req, res) => {
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        const data = fs.readFileSync(BACKUP_FILE, "utf8");
        res.json({ success: true, data: JSON.parse(data) });
      } else {
        res.json({ success: false, message: "Nenhum backup encontrado no servidor." });
      }
    } catch (error) {
      console.error("Error getting backup:", error);
      res.status(500).json({ success: false, error: "Erro ao carregar backup do servidor." });
    }
  });

  // API route to save backup
  app.post("/api/save-backup", (req, res) => {
    console.log("Received backup request");
    try {
      const backupData = req.body;
      if (!backupData || !backupData.data) {
        console.error("Invalid backup data received:", JSON.stringify(backupData).substring(0, 100));
        return res.status(400).json({ success: false, error: "Dados de backup inválidos." });
      }

      console.log("Saving backup to:", BACKUP_FILE);
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(backupData, null, 2));
      console.log("Backup saved to file");
      
      // Update local data
      const data = backupData.data;
      menuData = {
        menuItems: data.menuItems || [],
        categories: normalizeCategories(data.categories || [])
      };
      settings = data.settings || {};
      if (settings.categories) {
        settings.categories = normalizeCategories(settings.categories);
      }
      
      // Persist to menu and settings files
      saveJson(MENU_FILE, menuData);
      saveJson(SETTINGS_FILE, settings);
      
      // Restore other data if present in full backup
      if (data.activeOrders) { activeOrders = data.activeOrders; saveJson(ORDERS_FILE, activeOrders); }
      if (data.completedOrders) { completedOrders = data.completedOrders; saveJson(COMPLETED_ORDERS_FILE, completedOrders); }
      if (data.manualSales) { manualSales = data.manualSales; saveJson(MANUAL_SALES_FILE, manualSales); }
      if (data.waiterCalls) { waiterCalls = data.waiterCalls; saveJson(WAITER_CALLS_FILE, waiterCalls); }
      if (data.subscriptions) { subscriptions = data.subscriptions; saveJson(SUBSCRIPTIONS_FILE, subscriptions); }
      
      res.json({ success: true, message: "Backup salvo com sucesso no servidor!" });
      broadcast({ type: 'MENU_UPDATED' });
    } catch (error) {
      console.error("Error saving backup:", error);
      res.status(500).json({ success: false, error: "Erro ao salvar backup no servidor." });
    }
  });

  // API route to download all project files as ZIP
  app.get("/api/download-all-zip", async (req, res) => {
    try {
      console.log("Full project ZIP download requested");
      const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
      });

      res.attachment('projeto_completo_black_bbq.zip');

      archive.on('error', function(err) {
        console.error("Archiver error:", err);
        res.status(500).send({error: err.message});
      });

      // pipe archive data to the response
      archive.pipe(res);

      // Adicionar arquivos da raiz individualmente para ter certeza
      const rootFiles = ['.env.example', '.gitignore', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'server.ts', 'metadata.json', 'README.md', 'VPS_DEPLOY.md', 'START_VPS.sh', 'clear-cats.cjs', 'move_kds.cjs', 'test-cat.ts'];
      rootFiles.forEach(file => {
        if (fs.existsSync(path.join(process.cwd(), file))) {
          archive.file(file, { name: file });
        }
      });

      // Adicionar diretórios principais
      if (fs.existsSync(path.join(process.cwd(), 'src'))) {
        archive.directory('src/', 'src/');
      }
      if (fs.existsSync(path.join(process.cwd(), 'public'))) {
        archive.directory('public/', 'public/');
      }
      if (fs.existsSync(path.join(process.cwd(), 'data'))) {
        archive.directory('data/', 'data/');
      }
      if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
        archive.directory('dist/', 'dist/');
      }

      await archive.finalize();
      console.log("ZIP archive finalized and sent");
    } catch (error) {
      console.error("Error generating project ZIP:", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Erro ao gerar arquivo ZIP do projeto." });
      }
    }
  });

  // API route to save custom logo
  app.post("/api/save-logo", (req, res) => {
    try {
      const { logoData } = req.body;
      if (!logoData) {
        return res.status(400).json({ success: false, error: "Dados do logo não fornecidos." });
      }
      
      const base64Data = logoData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      fs.writeFileSync(CUSTOM_LOGO_FILE, buffer);
      res.json({ success: true, message: "Logo salvo com sucesso no servidor!" });
    } catch (error) {
      console.error("Error saving logo:", error);
      res.status(500).json({ success: false, error: "Erro ao salvar logo no servidor." });
    }
  });

  // API route to delete custom logo
  app.delete("/api/delete-logo", (req, res) => {
    try {
      if (fs.existsSync(CUSTOM_LOGO_FILE)) {
        fs.unlinkSync(CUSTOM_LOGO_FILE);
      }
      res.json({ success: true, message: "Logo removido com sucesso do servidor!" });
    } catch (error) {
      console.error("Error deleting logo:", error);
      res.status(500).json({ success: false, error: "Erro ao remover logo do servidor." });
    }
  });

  // API route to get current app logo
  app.get("/api/app-logo", (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    if (fs.existsSync(CUSTOM_LOGO_FILE)) {
      res.sendFile(CUSTOM_LOGO_FILE);
    } else {
      res.sendFile(path.join(process.cwd(), "public", "favicon.svg"));
    }
  });

  // VAPID Public Key API
  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidPublicKey });
  });

  // AI Chat API
  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: message,
        config: {
          systemInstruction: getSystemInstruction(),
          temperature: 0.7,
        },
      });

      const text = response.text || "A fumaça está densa por aqui. Pode repetir sua dúvida, parceiro?";
      res.json({ text });
    } catch (error) {
      console.error("Error fetching AI response:", error);
      res.status(500).json({ error: "O fogo deu uma oscilada aqui. Tente novamente em um minuto." });
    }
  });

  app.post("/api/flavor-profile", async (req, res) => {
    try {
      const { itemName, itemDescription } = req.body;
      const ai = getAiClient();
      const prompt = `Como um Pitmaster especialista, descreva o perfil sensorial (sabor, aroma, textura) do item "${itemName}" (${itemDescription}). Seja muito conciso. Máximo 18 palavras.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: "Você é um Pitmaster rústico e sofisticado. Vá direto ao ponto nas notas sensoriais.",
          temperature: 0.4,
        },
      });

      const text = response.text || "Sabor intenso, crocância equilibrada e finalização premium.";
      res.json({ text });
    } catch (error) {
      console.error("Error generating flavor profile:", error);
      res.status(500).json({ error: "Notas autênticas e finalização de alta qualidade." });
    }
  });

  app.post("/api/categorize-menu", async (req, res) => {
    try {
      const { items, categories } = req.body;
      if (!items || !categories) {
        return res.status(400).json({ error: "Items and categories are required" });
      }

      const ai = getAiClient();
      const prompt = `
        Você é um especialista em gastronomia e organização de cardápios.
        Sua tarefa é organizar uma lista de itens de cardápio nas categorias corretas.
        
        Categorias disponíveis:
        ${categories.join(", ")}
        
        Itens para organizar:
        ${items.map((item: any) => `- ID: ${item.id}, Nome: ${item.name}, Descrição: ${item.description}`).join("\n")}
        
        Responda APENAS com um JSON no seguinte formato:
        [
          { "id": "id_do_item", "category": "nome_da_categoria_escolhida" },
          ...
        ]
        Certifique-se de usar EXATAMENTE os nomes das categorias fornecidas.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const text = response.text;
      if (!text) throw new Error("Resposta vazia da IA.");
      
      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return res.json(JSON.parse(jsonMatch[0]));
      }
      throw new Error("Não foi possível processar a resposta da IA.");
    } catch (error) {
      console.error("Error categorizing menu:", error);
      res.status(500).json({ error: "Erro ao categorizar itens com Gemini." });
    }
  });

  // Subscription API
  app.post("/api/subscribe", async (req, res) => {
    try {
      const subscription = req.body;
      subscriptions.push({ ...subscription, id: Date.now().toString() });
      saveJson(SUBSCRIPTIONS_FILE, subscriptions);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving subscription:", error);
      res.status(500).json({ success: false });
    }
  });

  // Helper to send push
  const sendPushNotification = (payload: any) => {
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, JSON.stringify(payload))
        .catch(async err => {
          if (err.statusCode === 410) {
            subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
            saveJson(SUBSCRIPTIONS_FILE, subscriptions);
          } else {
            console.error("Error sending push notification:", err);
          }
        });
    });
  };

  // Waiter Calls API
  app.get("/api/waiter-calls", (req, res) => {
    res.json(waiterCalls.filter(c => c.status === 'pending'));
  });

  app.post("/api/waiter-calls", async (req, res) => {
    try {
      const call = req.body;
      const existingCall = waiterCalls.find(c => c.table === call.table && c.status === 'pending');
      if (existingCall) {
        return res.json({ success: true, alreadyExists: true });
      }
      
      const callWithId = { ...call, id: Date.now().toString() };
      waiterCalls.push(callWithId);
      saveJson(WAITER_CALLS_FILE, waiterCalls);
      
      broadcast({ type: 'WAITER_CALL_CREATED', data: callWithId });
      sendPushNotification({ title: 'Novo Chamado de Garçom', body: `Mesa: ${call.table} - ${call.customerName || 'Cliente'}` });
      res.json({ success: true });
    } catch (error) {
      console.error("Error creating waiter call:", error);
      res.status(500).json({ success: false });
    }
  });

  app.patch("/api/waiter-calls/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (status === 'pending') {
        const index = waiterCalls.findIndex(c => c.id === id);
        if (index !== -1) {
          waiterCalls[index].status = status;
        }
      } else {
        waiterCalls = waiterCalls.filter(c => c.id !== id);
      }
      saveJson(WAITER_CALLS_FILE, waiterCalls);
      
      broadcast({ type: 'WAITER_CALL_UPDATED', data: { id, status } });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating waiter call:", error);
      res.status(500).json({ success: false });
    }
  });

  // Orders API
  app.get("/api/orders", (req, res) => {
    res.json(activeOrders);
  });

  app.get("/api/admin/stats", async (req, res) => {
    console.log("Admin stats requested");
    try {
      res.json({ orders: completedOrders, manualSales });
    } catch (error) {
      console.error("Error in /api/admin/stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/manual-sales", async (req, res) => {
    try {
      const sale = req.body;
      manualSales.push(sale);
      
      // Update stock
      let stockUpdated = false;
      sale.items.forEach((saleItem: any) => {
        const menuItem = menuData.menuItems.find((mi: any) => mi.id === saleItem.id);
        if (menuItem && typeof menuItem.stock === 'number') {
          menuItem.stock = Math.max(0, menuItem.stock - saleItem.quantity);
          stockUpdated = true;
        }
      });
      
      if (stockUpdated) {
        saveJson(MENU_FILE, menuData);
        broadcast({ type: 'MENU_UPDATED' });
      }

      saveJson(MANUAL_SALES_FILE, manualSales);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding manual sale:", error);
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/admin/update-stock", async (req, res) => {
    try {
      const { itemId, newStock } = req.body;
      const menuItem = menuData.menuItems.find((mi: any) => mi.id === itemId);
      if (menuItem) {
        menuItem.stock = newStock;
        saveJson(MENU_FILE, menuData);
        broadcast({ type: 'MENU_UPDATED' });
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, message: "Item not found" });
      }
    } catch (error) {
      console.error("Error updating stock:", error);
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const order = req.body;
      if (!order) {
        return res.status(400).json({ success: false, error: "Dados do pedido ausentes." });
      }

      const orderWithId = { 
        ...order, 
        id: order.id || Date.now().toString(),
        items: order.items || [],
        total: order.total || 0,
        status: order.status || 'pending',
        timestamp: order.timestamp || new Date().toISOString()
      };
      
      activeOrders.push(orderWithId);
      
      // Update stock
      let stockUpdated = false;
      if (Array.isArray(orderWithId.items)) {
        orderWithId.items.forEach((orderItem: any) => {
          const menuItem = menuData.menuItems.find((mi: any) => mi.id === orderItem.id);
          if (menuItem && typeof menuItem.stock === 'number') {
            menuItem.stock = Math.max(0, menuItem.stock - (orderItem.quantity || 0));
            stockUpdated = true;
          }
        });
      }
      
      if (stockUpdated) {
        saveJson(MENU_FILE, menuData);
        broadcast({ type: 'MENU_UPDATED' });
      }

      saveJson(ORDERS_FILE, activeOrders);
      
      broadcast({ type: 'ORDER_CREATED', data: orderWithId });
      
      // Safe push notification
      const table = orderWithId.table || 'N/A';
      const total = typeof orderWithId.total === 'number' ? orderWithId.total.toFixed(2) : '0.00';
      sendPushNotification({ 
        title: 'Novo Pedido', 
        body: `Mesa: ${table} - R$ ${total}` 
      });
      
      res.json({ success: true, id: orderWithId.id });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Erro interno no servidor" });
    }
  });

  app.patch("/api/orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const index = activeOrders.findIndex(o => o.id === id);
      if (index !== -1) {
        activeOrders[index] = { ...activeOrders[index], ...updates };
        if (['concluded', 'delivered', 'cancelled'].includes(updates.status)) {
          if (updates.status === 'concluded') {
            completedOrders.push({ ...activeOrders[index] });
            saveJson(COMPLETED_ORDERS_FILE, completedOrders);
          }
          activeOrders = activeOrders.filter(o => o.id !== id);
        }
        saveJson(ORDERS_FILE, activeOrders);
      }
      
      broadcast({ type: 'ORDER_UPDATED', data: { id, ...updates } });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ success: false });
    }
  });

  app.delete("/api/orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      activeOrders = activeOrders.filter(o => o.id !== id);
      saveJson(ORDERS_FILE, activeOrders);
      broadcast({ type: 'ORDER_DELETED', data: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ success: false });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true, 
        allowedHosts: ['blackbarbecue.com.br', 'www.blackbarbecue.com.br', 'localhost', '127.0.0.1', '0.0.0.0', '::1', '.blackbarbecue.com.br'],
        cors: true
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
