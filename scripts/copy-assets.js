const { copyFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const targets = [
	join('dist', 'nodes', 'RichApi', 'richapi.svg'),
	join('dist', 'nodes', 'RichApiTrigger', 'richapi.svg'),
	join('dist', 'icons', 'richapi.svg'),
	join('dist', 'icons', 'richapi.dark.svg'),
];

for (const target of targets) {
	mkdirSync(join(process.cwd(), target, '..'), { recursive: true });
	copyFileSync(
		join(process.cwd(), 'icons', target.endsWith('dark.svg') ? 'richapi.dark.svg' : 'richapi.svg'),
		join(process.cwd(), target),
	);
}
