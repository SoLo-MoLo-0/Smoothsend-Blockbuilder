const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const forgeUserPath = path.join(userProfile, '.foundry', 'bin', process.platform === 'win32' ? 'forge.exe' : 'forge');

let forgeCmd = 'forge';
if (fs.existsSync(forgeUserPath)) {
  forgeCmd = forgeUserPath;
}

const result = spawnSync(forgeCmd, ['test'], { stdio: 'inherit' });
process.exit(result.status ?? 0);
