const fs = require('fs');

if (fs.existsSync('data/menu.json')) {
  let data = JSON.parse(fs.readFileSync('data/menu.json', 'utf8'));
  if (Array.isArray(data.categories)) data.categories = [];
  if (Array.isArray(data.menuItems)) {
    data.menuItems.forEach(i => {
      i.category = 'Sem Categoria';
      i.categories = ['Sem Categoria'];
    });
  }
  fs.writeFileSync('data/menu.json', JSON.stringify(data, null, 2));
  console.log('Cleaned menu.json');
}

if (fs.existsSync('data/settings.json')) {
  let settings = JSON.parse(fs.readFileSync('data/settings.json', 'utf8'));
  settings.categories = [];
  fs.writeFileSync('data/settings.json', JSON.stringify(settings, null, 2));
  console.log('Cleaned settings.json');
}
