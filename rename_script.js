const fs = require('fs');
const path = require('path');

const exts = ['.js', '.jsx', '.py'];
const ignoreDirs = ['node_modules', '.git', 'venv', 'scratch'];

function replaceTerms(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Specific replacements to avoid breaking 'analysis' words that are just english words
  content = content.replace(/selectedEntity/g, 'selectedEntity');
  content = content.replace(/changeEntity/g, 'changeEntity');
  content = content.replace(/entities/g, 'entities');
  content = content.replace(/entityId/g, 'entityId');
  content = content.replace(/entity_id/g, 'entity_id');
  content = content.replace(/entityContext/gi, 'entityContext');
  content = content.replace(/useEntity/g, 'useEntity');
  content = content.replace(/entityContext/g, 'EntityContext');
  content = content.replace(/EntityProvider/g, 'EntityProvider');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', filePath);
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (ignoreDirs.includes(f)) continue;
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      walk(p);
    } else if (stat.isFile() && exts.some(ext => p.endsWith(ext))) {
      replaceTerms(p);
    }
  }
}

walk(process.cwd());
console.log('Done replacement.');
