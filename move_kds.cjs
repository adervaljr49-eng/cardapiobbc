const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

const startMarker = '  // KDS Order Card Component\n  const KDSOrderCard = ({ order, onUpdateOrder, onDelete, menuItems }: { ';
const startIndex = content.indexOf(startMarker);
if (startIndex === -1) {
  console.log('Start marker not found');
  process.exit(1);
}

const endMarker = '    );\n  };\n  const [isAiCategorizing';
const endIndex = content.indexOf(endMarker, startIndex);
if (endIndex === -1) {
  console.log('End marker not found');
  process.exit(1);
}

const kdsContent = content.substring(startIndex, endIndex + 9);
let newContent = content.substring(0, startIndex) + content.substring(endIndex + 9);

let newKdsContent = kdsContent.replace(
  'onDelete: (id: string) => void,\n    menuItems: MenuItem[],\n    key?: string\n  }) => {',
  'onDelete: (id: string) => void,\n    menuItems: MenuItem[],\n    setAlertDialog: (dialog: { isOpen: boolean, message: string } | null) => void,\n    logoUrl: string | null,\n    key?: string\n  }) => {'
);

newKdsContent = newKdsContent.replace('  // KDS Order Card Component\n  const KDSOrderCard', '// KDS Order Card Component\nconst KDSOrderCard');

const appStartIndex = newContent.indexOf('export default function App() {');
newContent = newContent.substring(0, appStartIndex) + newKdsContent + '\n' + newContent.substring(appStartIndex);

newContent = newContent.replace(
  /<KDSOrderCard \n                                key=\{order\.id\} \n                                order=\{order\} \n                                onUpdateOrder=\{handleUpdateOrder\}\n                                onDelete=\{handleDeleteOrder\}\n                                menuItems=\{menuItems\}\n                              \/>/g,
  '<KDSOrderCard \n                                key={order.id} \n                                order={order} \n                                onUpdateOrder={handleUpdateOrder}\n                                onDelete={handleDeleteOrder}\n                                menuItems={menuItems}\n                                setAlertDialog={setAlertDialog}\n                                logoUrl={logoUrl}\n                              />'
);

fs.writeFileSync('App.tsx', newContent);
console.log('Done');
