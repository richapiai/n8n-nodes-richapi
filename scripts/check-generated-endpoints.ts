import { generateEndpointFiles, readGeneratedEndpointFiles } from './endpoint-generator';

const expected = generateEndpointFiles();
const actual = readGeneratedEndpointFiles();
const staleFiles = [
	expected.endpoints === actual.endpoints ? undefined : 'nodes/RichApi/endpoints.generated.ts',
	expected.asyncEndpointMap === actual.asyncEndpointMap
		? undefined
		: 'nodes/RichApi/asyncEndpointMap.generated.ts',
].filter((fileName): fileName is string => Boolean(fileName));

if (staleFiles.length > 0) {
	console.error(`Generated endpoint files are stale: ${staleFiles.join(', ')}`);
	console.error('Run npm run generate and commit the result.');
	process.exit(1);
}

console.log('Generated endpoint files are fresh.');
