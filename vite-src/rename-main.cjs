const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "out", "electron");
fs.readdirSync(dir).forEach(f => {
  if (f.endsWith(".js") && !f.endsWith(".d.ts")) {
    const oldPath = path.join(dir, f);
    const newPath = path.join(dir, f.replace(/\.js$/, ".cjs"));
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }
  }
});
