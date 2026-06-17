const { copyFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const targets = [
	join('dist', 'nodes', 'RichApi', 'richapi.png'),
	join('dist', 'icons', 'richapi.png'),
];

for (const target of targets) {
	mkdirSync(join(process.cwd(), target, '..'), { recursive: true });
	copyFileSync(join(process.cwd(), 'icons', 'richapi.png'), join(process.cwd(), target));
}
