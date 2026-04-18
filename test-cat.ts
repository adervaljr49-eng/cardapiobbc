enum Category {
  ENTRADAS = '🔥 Entradas',
  PRATOS_PRINCIPAIS = '🥩 Pratos Principais',
  REFEICOES = '🥩 Refeições',
  CHURRASCO = '🔥 Churrasco',
  MASSAS = '🍝 Massas',
  FRUTOS_DO_MAR = '🐟 Frutos do Mar',
  LANCHES = '🍔 Lanches',
  DRINKS = '🍹 Drinks',
  CERVEJAS = '🍺 Cervejas',
  VINHOS = '🍷 Vinhos',
  DESTILADOS = '🥃 Destilados',
  BEBIDAS_NAO_ALCOOLICAS = '🥤 Bebidas Não Alcoólicas',
  CAFES = '☕ Cafés',
  SOBREMESAS = '🍰 Sobremesas',
  MAIS_VENDIDOS = '⭐ Mais Vendidos',
  PROMOCOES = '🔥 Promoções',
  PARA_COMPARTILHAR = '👨‍👩‍👧 Para Compartilhar'
}

const getCleanCategory = (catName: string): string => {
  if (!catName) return '';
  
  const trimmed = String(catName).trim();
  
  const exact = Object.values(Category).find(v => 
    v.toLowerCase() === trimmed.toLowerCase() ||
    v.replace(/[^\w\s]/g, '').trim().toLowerCase() === trimmed.replace(/[^\w\s]/g, '').trim().toLowerCase() ||
    trimmed.toLowerCase().includes(v.replace(/[^\w\s]/g, '').trim().toLowerCase())
  );
  if (exact) return exact;

  const normalized = trimmed.toLowerCase();
  const cleanName = trimmed.replace(/[^\w\sà-úÀ-Ú]/g, '').trim().toLowerCase();
  
  if (normalized.includes('pratos principais')) return Category.PRATOS_PRINCIPAIS;
  if (normalized.includes('refeições') || cleanName.includes('refeicoes') || normalized.includes('refeição') || cleanName.includes('refeicao')) return Category.REFEICOES;
  if (normalized.includes('bebidas não alcoólicas') || cleanName.includes('bebidas nao alcoolicas') || normalized.includes('bebida não alcoólica') || cleanName.includes('bebida nao alcoolica')) return Category.BEBIDAS_NAO_ALCOOLICAS;
  if (normalized.includes('bebidas')) return Category.BEBIDAS_NAO_ALCOOLICAS;
  if (normalized.includes('entradas')) return Category.ENTRADAS;
  if (normalized.includes('sobremesas')) return Category.SOBREMESAS;
  if (normalized.includes('lanches')) return Category.LANCHES;
  if (normalized.includes('combos')) return Category.LANCHES;
  if (normalized.includes('churrasco')) return Category.CHURRASCO;
  if (normalized.includes('massas')) return Category.MASSAS;
  if (normalized.includes('frutos do mar')) return Category.FRUTOS_DO_MAR;
  if (normalized.includes('drinks')) return Category.DRINKS;
  if (normalized.includes('cervejas')) return Category.CERVEJAS;
  if (normalized.includes('vinhos')) return Category.VINHOS;
  if (normalized.includes('destilados')) return Category.DESTILADOS;
  if (normalized.includes('cafés') || cleanName.includes('cafes')) return Category.CAFES;
  if (normalized.includes('mais vendidos')) return Category.MAIS_VENDIDOS;
  if (normalized.includes('promoções') || cleanName.includes('promocoes')) return Category.PROMOCOES;
  if (normalized.includes('para compartilhar')) return Category.PARA_COMPARTILHAR;

  return trimmed;
};

console.log("TEST 1: 🖼 DESTILADOS ->", getCleanCategory("🖼 Destilados"));
console.log("TEST 2: Destilados ->", getCleanCategory("Destilados"));
console.log("TEST 3: DESTILADOS ->", getCleanCategory("DESTILADOS"));
