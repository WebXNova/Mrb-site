import fs from 'fs';
import path from 'path';

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        searchDir(fullPath, query);
      }
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes(query.toLowerCase())) {
        console.log(`Found in: ${fullPath}`);
      }
    }
  }
}

try {
  console.log("Searching client...");
  searchDir('../client', 'seats_fantasy');
  console.log("Searching server...");
  searchDir('.', 'seats_fantasy');
  console.log("Search complete.");
} catch (e) {
  console.error(e);
}
