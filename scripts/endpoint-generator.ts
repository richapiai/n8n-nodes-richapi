import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { RichApiEndpoint, RichApiEndpointField } from '../nodes/RichApi/types';

interface RichApiManifest {
	base_url: string;
	endpoints: RichApiManifestEndpoint[];
}

interface RichApiManifestEndpoint {
	name: string;
	display_name: string;
	description: string;
	category?: string | null;
	method: RichApiEndpoint['method'];
	path: string;
	input_schema?: JsonObject;
	output_schema?: unknown;
	path_params?: RichApiManifestParameter[];
	query_params?: RichApiManifestParameter[];
	default_query?: JsonObject;
	default_body?: JsonObject;
	example_body?: JsonObject;
	async: RichApiEndpoint['async'];
	polling?: RichApiEndpoint['polling'];
	webhook?: RichApiEndpoint['webhook'];
	integrations?: {
		n8n?: {
			enabled?: boolean;
			operation_name?: string;
		};
	};
}

interface RichApiManifestParameter {
	name: string;
	display_name?: string;
	description?: string;
	required?: boolean;
	schema?: JsonObject;
}

type JsonObject = Record<string, unknown>;

interface GeneratedFiles {
	endpoints: string;
	asyncEndpointMap: string;
}

interface SchemaProperty {
	type?: string | string[];
	description?: string;
	enum?: unknown[];
	default?: unknown;
}

const repoRoot = process.cwd();
const manifestPath = join(repoRoot, 'manifest', 'richapi-endpoints.manifest.json');
const endpointsPath = join(repoRoot, 'nodes', 'RichApi', 'endpoints.generated.ts');
const asyncEndpointMapPath = join(repoRoot, 'nodes', 'RichApi', 'asyncEndpointMap.generated.ts');

export function generateEndpointFiles(): GeneratedFiles {
	const manifest = readManifest();
	const enabledManifestEndpoints = manifest.endpoints.filter(
		(endpoint) => endpoint.integrations?.n8n?.enabled !== false,
	);
	validateManifestEndpoints(enabledManifestEndpoints);

	const endpoints = enabledManifestEndpoints
		.map(normalizeEndpoint)
		.sort((left, right) => left.displayName.localeCompare(right.displayName));
	validateGeneratedEndpoints(endpoints);

	return {
		endpoints: renderEndpointsFile(endpoints),
		asyncEndpointMap: renderAsyncEndpointMapFile(endpoints),
	};
}

export function writeEndpointFiles(): void {
	const generated = generateEndpointFiles();

	writeFileSync(endpointsPath, generated.endpoints);
	writeFileSync(asyncEndpointMapPath, generated.asyncEndpointMap);
}

export function readGeneratedEndpointFiles(): GeneratedFiles {
	return {
		endpoints: readFileSync(endpointsPath, 'utf8'),
		asyncEndpointMap: readFileSync(asyncEndpointMapPath, 'utf8'),
	};
}

if (require.main === module) {
	writeEndpointFiles();
}

function readManifest(): RichApiManifest {
	return JSON.parse(readFileSync(manifestPath, 'utf8')) as RichApiManifest;
}

function validateManifestEndpoints(endpoints: RichApiManifestEndpoint[]): void {
	assertUnique(
		endpoints.map((endpoint) => endpoint.name),
		'endpoint names',
	);
	assertUnique(
		endpoints
			.map((endpoint) => endpoint.integrations?.n8n?.operation_name)
			.filter(isString),
		'n8n operation names',
	);
}

function validateGeneratedEndpoints(endpoints: RichApiEndpoint[]): void {
	assertUnique(
		endpoints.map((endpoint) => endpoint.name),
		'generated endpoint names',
	);

	for (const endpoint of endpoints) {
		assertUnique(
			endpoint.fields.map((field) => field.parameterName),
			`${endpoint.name} generated field names`,
		);
	}
}

function normalizeEndpoint(endpoint: RichApiManifestEndpoint): RichApiEndpoint {
	const fields: RichApiEndpointField[] = [
		...generateParameterFields(endpoint, 'path'),
		...generateParameterFields(endpoint, 'query'),
		...generateBodyFields(endpoint),
	];

	return {
		name: endpoint.integrations?.n8n?.operation_name ?? endpoint.name,
		displayName: endpoint.display_name,
		description: endpoint.description,
		category: endpoint.category ?? undefined,
		method: endpoint.method,
		path: endpoint.path,
		inputSchema: endpoint.input_schema ?? {},
		outputSchema: endpoint.output_schema ?? {},
		pathParams: normalizeManifestParameters(endpoint.path_params),
		queryParams: normalizeManifestParameters(endpoint.query_params),
		defaultQuery: endpoint.default_query ?? {},
		defaultBody: endpoint.default_body ?? {},
		exampleBody: endpoint.example_body ?? {},
		async: endpoint.async,
		polling: endpoint.polling ?? null,
		webhook: endpoint.webhook ?? null,
		fields,
	};
}

function normalizeManifestParameters(parameters: RichApiManifestParameter[] = []): RichApiEndpoint['pathParams'] {
	return parameters.map((parameter) => ({
		name: parameter.name,
		display_name: parameter.display_name,
		description: parameter.description,
		required: parameter.required ?? false,
		schema: parameter.schema ?? {},
	}));
}

function generateParameterFields(
	endpoint: RichApiManifestEndpoint,
	source: RichApiEndpointField['source'],
): RichApiEndpointField[] {
	const parameters = source === 'path' ? endpoint.path_params ?? [] : endpoint.query_params ?? [];

	return parameters.map((parameter) => ({
		source,
		name: parameter.name,
		parameterName: buildParameterName(source, endpoint.name, parameter.name),
		required: source === 'path' ? true : parameter.required ?? false,
	}));
}

function generateBodyFields(endpoint: RichApiManifestEndpoint): RichApiEndpointField[] {
	const schema = endpoint.input_schema;

	if (!isJsonObject(schema) || schema.type !== 'object' || !isJsonObject(schema.properties)) {
		return [];
	}

	const required = Array.isArray(schema.required) ? schema.required.filter(isString) : [];

	return Object.entries(schema.properties)
		.filter(([, property]) => isSimpleSchema(property))
		.map(([name]) => ({
			source: 'body' as const,
			name,
			parameterName: buildParameterName('body', endpoint.name, name),
			required: required.includes(name),
		}));
}

function renderEndpointsFile(endpoints: RichApiEndpoint[]): string {
	const endpointOptions: INodePropertyOptions[] = endpoints.map((endpoint) => ({
		name: endpoint.displayName,
		value: endpoint.name,
		description: describeOption(endpoint),
	}));
	const endpointProperties = endpoints.flatMap(renderEndpointFields);
	const defaultEndpointName = endpoints[0]?.name ?? '';
	const asyncEndpointNames = endpoints
		.filter((endpoint) => endpoint.async.enabled)
		.map((endpoint) => endpoint.name);
	const webhookEndpointNames = endpoints
		.filter((endpoint) => endpoint.webhook?.request_field)
		.map((endpoint) => endpoint.name);
	const pollingEndpointNames = endpoints
		.filter((endpoint) => endpoint.polling)
		.map((endpoint) => endpoint.name);

	return [
		"import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';",
		"import type { RichApiEndpoint } from './types';",
		'',
		'// Generated by scripts/generate-endpoints.ts. Do not edit by hand.',
		`export const DEFAULT_ENDPOINT_NAME = ${JSON.stringify(defaultEndpointName)};`,
		'',
		`export const ENDPOINT_OPTIONS: INodePropertyOptions[] = ${stringify(endpointOptions)};`,
		'',
		`export const ENDPOINT_PROPERTIES: INodeProperties[] = ${stringify(endpointProperties)};`,
		'',
		`export const ENDPOINTS: RichApiEndpoint[] = ${stringify(endpoints)};`,
		'',
		`export const ASYNC_ENDPOINT_NAMES: string[] = ${stringify(asyncEndpointNames)};`,
		'',
		`export const WEBHOOK_ENDPOINT_NAMES: string[] = ${stringify(webhookEndpointNames)};`,
		'',
		`export const POLLING_ENDPOINT_NAMES: string[] = ${stringify(pollingEndpointNames)};`,
		'',
	].join('\n');
}

function renderEndpointFields(endpoint: RichApiEndpoint): INodeProperties[] {
	return endpoint.fields.map((field) => {
		const schema = getFieldSchema(endpoint, field);
		const property: INodeProperties = {
			displayName: getFieldDisplayName(endpoint, field.name),
			name: field.parameterName,
			type: getNodePropertyType(schema),
			displayOptions: {
				show: {
					endpoint: [endpoint.name],
				},
			},
			default: getDefaultValue(endpoint, field.name, schema) as INodeProperties['default'],
			required: field.required,
			description: getFieldDescription(endpoint, field.name, schema),
		};

		if (Array.isArray(schema.enum)) {
			property.type = 'options';
			property.options = schema.enum.map((value) => ({
				name: String(value),
				value: String(value),
			}));
		}

		return property;
	});
}

function renderAsyncEndpointMapFile(endpoints: RichApiEndpoint[]): string {
	const asyncEndpointMap = Object.fromEntries(
		endpoints
			.filter((endpoint) => endpoint.async.enabled)
			.map((endpoint) => [
				endpoint.name,
				{
					polling: endpoint.polling,
					webhook: endpoint.webhook,
				},
			]),
	);

	return [
		"import type { RichApiPollingMetadata, RichApiWebhookMetadata } from './types';",
		'',
		'// Generated by scripts/generate-endpoints.ts. Do not edit by hand.',
		'export interface RichApiAsyncEndpointMapEntry {',
		'\tpolling: RichApiPollingMetadata | null;',
		'\twebhook: RichApiWebhookMetadata | null;',
		'}',
		'',
		`export const ASYNC_ENDPOINT_MAP: Record<string, RichApiAsyncEndpointMapEntry> = ${stringify(asyncEndpointMap)};`,
		'',
	].join('\n');
}

function describeOption(endpoint: RichApiEndpoint): string {
	return [endpoint.category, endpoint.description].filter(Boolean).join(': ');
}

function getFieldSchema(endpoint: RichApiEndpoint, field: RichApiEndpointField): SchemaProperty {
	if (field.source === 'path') {
		return findParameterSchema(endpoint.pathParams, field.name);
	}

	if (field.source === 'query') {
		return findParameterSchema(endpoint.queryParams, field.name);
	}

	const schema = endpoint.inputSchema;

	if (isJsonObject(schema.properties)) {
		const property = schema.properties[field.name];

		if (isJsonObject(property)) {
			return property;
		}
	}

	return {};
}

function findParameterSchema(parameters: RichApiEndpoint['pathParams'], name: string): SchemaProperty {
	const parameter = parameters.find((candidate) => candidate.name === name);

	return parameter?.schema ?? {};
}

function getFieldDisplayName(endpoint: RichApiEndpoint, fieldName: string): string {
	const pathOrQueryParam = [...endpoint.pathParams, ...endpoint.queryParams].find(
		(parameter) => parameter.name === fieldName,
	);

	return pathOrQueryParam?.display_name ?? titleCase(fieldName);
}

function getFieldDescription(endpoint: RichApiEndpoint, fieldName: string, schema: SchemaProperty): string {
	const pathOrQueryParam = [...endpoint.pathParams, ...endpoint.queryParams].find(
		(parameter) => parameter.name === fieldName,
	);

	return pathOrQueryParam?.description ?? schema.description ?? `${endpoint.displayName} ${titleCase(fieldName)}.`;
}

function getDefaultValue(endpoint: RichApiEndpoint, fieldName: string, schema: SchemaProperty): unknown {
	const defaultBodyValue = endpoint.defaultBody[fieldName];
	const exampleBodyValue = endpoint.exampleBody[fieldName];
	const candidate = defaultBodyValue ?? schema.default ?? exampleBodyValue;

	if (candidate !== undefined) {
		return candidate;
	}

	if (getNodePropertyType(schema) === 'number') {
		return 0;
	}

	if (getNodePropertyType(schema) === 'boolean') {
		return false;
	}

	if (getNodePropertyType(schema) === 'json') {
		return '{}';
	}

	return '';
}

function getNodePropertyType(schema: SchemaProperty): INodeProperties['type'] {
	const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

	if (schema.enum) {
		return 'options';
	}

	if (type === 'number' || type === 'integer') {
		return 'number';
	}

	if (type === 'boolean') {
		return 'boolean';
	}

	if (type === 'object' || type === 'array') {
		return 'json';
	}

	return 'string';
}

function buildParameterName(source: RichApiEndpointField['source'], endpointName: string, fieldName: string): string {
	return `${source}_${sanitizeName(endpointName)}_${sanitizeName(fieldName)}`;
}

function sanitizeName(value: string): string {
	return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function titleCase(value: string): string {
	return value
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function isSimpleSchema(value: unknown): value is SchemaProperty {
	if (!isJsonObject(value)) {
		return false;
	}

	const type = Array.isArray(value.type) ? value.type[0] : value.type;

	return type !== 'object' && type !== 'array';
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function assertUnique(values: string[], label: string): void {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		}

		seen.add(value);
	}

	if (duplicates.size > 0) {
		throw new Error(`Duplicate ${label}: ${Array.from(duplicates).join(', ')}`);
	}
}

function stringify(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}
