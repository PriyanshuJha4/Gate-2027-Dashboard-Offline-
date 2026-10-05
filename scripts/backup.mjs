import fs from "node:fs";
import path from "node:path";

const backupDir = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(process.cwd(), "data", "backups");

fs.mkdirSync(backupDir, { recursive: true });
console.log(`[backup] Backup directory ready: ${backupDir}`);
