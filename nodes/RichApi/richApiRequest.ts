import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type {
	RichApiCompletionMode,
	RichApiEndpoint,
	RichApiEndpointField,
} from './types';

export interface RichApiExecutionOptions {
	completionMode: RichApiCompletionMode;
	rawJsonBody?: string;
	rawResponse?: boolean;
	timeoutSeconds?: number;
	webhookUrl?: string;
	pollingIntervalSeconds?: number;
	maxWaitMinutes?: number;
	failOnJobFailure?: boolean;
	returnPartialResultOnTimeout?: boolean;
}

export async function executeRichApiEndpoint(
	this: IExecuteFunctions,
	endpoint: RichApiEndpoint,
	allEndpoints: RichApiEndpoint[],
	itemIndex: number,
	options: RichApiExecutionOptions,
): Promise<INodeExecutionData[]> {
	const response = await callRichApiEndpoint.call(this, endpoint, itemIndex, options);

	if (endpoint.async.enabled && options.completionMode === 'waitUntilComplete') {
		return waitForAsyncCompletion.call(this, endpoint, allEndpoints, itemIndex, response, options);
	}

	return responseToExecutionData(response, options.rawResponse);
}

async function callRichApiEndpoint(
	this: IExecuteFunctions,
	endpoint: RichApiEndpoint,
	itemIndex: number,
	options: RichApiExecutionOptions,
	overridePathParams?: IDataObject,
): Promise<unknown> {
	const query = buildQuery.call(this, endpoint, itemIndex);
	const body = buildBody.call(this, endpoint, itemIndex, options);
	const path = buildPath.call(this, endpoint, itemIndex, overridePathParams);
	const credentials = await this.getCredentials('richApiApi');
	const baseUrl = normalizeBaseUrl(credentials.baseUrl);
	const requestOptions: IHttpRequestOptions = {
		method: endpoint.method as IHttpRequestMethods,
		url: `${baseUrl}${path}`,
		qs: query,
		json: true,
		timeout: (options.timeoutSeconds ?? 300) * 1000,
	};

	if (Object.keys(body).length > 0) {
		requestOptions.body = body;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'richApiApi', requestOptions);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), formatRichApiError(error), {
			itemIndex,
			description: 'RichAPI request failed',
		});
	}
}

function normalizeBaseUrl(value: unknown): string {
	const baseUrl = String(value || 'https://api.richapi.ai/api/v1').trim();

	return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function waitForAsyncCompletion(
	this: IExecuteFunctions,
	endpoint: RichApiEndpoint,
	allEndpoints: RichApiEndpoint[],
	itemIndex: number,
	initialResponse: unknown,
	options: RichApiExecutionOptions,
): Promise<INodeExecutionData[]> {
	const polling = endpoint.polling;

	if (!polling) {
		throw new NodeOperationError(this.getNode(), 'This RichAPI endpoint does not publish polling metadata yet.', {
			itemIndex,
			description: 'Use Return Job ID or Deliver to Webhook for this endpoint.',
		});
	}

	const pollingEndpointName = polling.polling_endpoint ?? polling.endpoint_name;
	const pollingEndpoint = allEndpoints.find((candidate) => candidate.name === pollingEndpointName);

	if (!pollingEndpoint) {
		throw new NodeOperationError(this.getNode(), `Polling endpoint "${pollingEndpointName}" was not found.`, {
			itemIndex,
		});
	}

	const jobId = getFirstStringAtPath(initialResponse, [
		polling.job_id_path,
		'jobId',
		'job_id',
		'id',
	]);

	if (!jobId) {
		throw new NodeOperationError(this.getNode(), 'RichAPI did not return a job ID for polling.', {
			itemIndex,
		});
	}

	const intervalMs = Math.max(1, options.pollingIntervalSeconds ?? 10) * 1000;
	const deadline = Date.now() + Math.max(1, options.maxWaitMinutes ?? 15) * 60 * 1000;
	let lastResponse: unknown = initialResponse;

	while (Date.now() < deadline) {
		await sleep(intervalMs);

		lastResponse = await callRichApiEndpoint.call(
			this,
			pollingEndpoint,
			itemIndex,
			{ ...options, rawJsonBody: undefined },
			{
				[polling.id_parameter ?? 'id']: jobId,
			},
		);

		const status = getFirstStringAtPath(lastResponse, [polling.status_path, 'status']);
		const terminalStatuses = polling.terminal_statuses ?? [];
		const successStatuses = polling.success_statuses ?? [];
		const failureStatuses = polling.failure_statuses ?? [];

		if (!status || !terminalStatuses.includes(status)) {
			continue;
		}

		if (successStatuses.includes(status)) {
			const result = polling.result_path ? getValueAtPath(lastResponse, polling.result_path) : lastResponse;
			return responseToExecutionData(result ?? lastResponse, options.rawResponse);
		}

		if (failureStatuses.includes(status) && options.failOnJobFailure !== false) {
			throw new NodeOperationError(this.getNode(), `RichAPI job ${jobId} finished with status "${status}".`, {
				itemIndex,
			});
		}

		return responseToExecutionData(lastResponse, options.rawResponse);
	}

	if (options.returnPartialResultOnTimeout) {
		return responseToExecutionData(lastResponse, options.rawResponse);
	}

	throw new NodeOperationError(this.getNode(), 'Timed out waiting for the RichAPI job to finish.', {
		itemIndex,
		description: `Job ID: ${jobId}`,
	});
}

function buildPath(
	this: IExecuteFunctions,
	endpoint: RichApiEndpoint,
	itemIndex: number,
	overridePathParams?: IDataObject,
): string {
	let path = endpoint.path;

	for (const field of endpoint.fields.filter((candidate) => candidate.source === 'path')) {
		const value = overridePathParams?.[field.name] ?? this.getNodeParameter(field.parameterName, itemIndex);
		path = path.replace(`{${field.name}}`, encodeURIComponent(String(value)));
	}

	return path;
}

function buildQuery(this: IExecuteFunctions, endpoint: RichApiEndpoint, itemIndex: number): IDataObject {
	const query = { ...endpoint.defaultQuery } as IDataObject;

	for (const field of endpoint.fields.filter((candidate) => candidate.source === 'query')) {
		const value = readOptionalParameter.call(this, field, itemIndex);

		if (value !== undefined) {
			query[field.name] = value;
		}
	}

	return query;
}

function buildBody(
	this: IExecuteFunctions,
	endpoint: RichApiEndpoint,
	itemIndex: number,
	options: RichApiExecutionOptions,
): IDataObject {
	const body = { ...endpoint.defaultBody } as IDataObject;

	for (const field of endpoint.fields.filter((candidate) => candidate.source === 'body')) {
		const value = readOptionalParameter.call(this, field, itemIndex);

		if (value !== undefined) {
			body[field.name] = value;
		}
	}

	if (endpoint.webhook?.request_field && options.completionMode === 'deliverToWebhook' && options.webhookUrl) {
		body[endpoint.webhook.request_field] = options.webhookUrl;
	}

	if (options.rawJsonBody) {
		const rawBody = parseRawJsonBody.call(this, options.rawJsonBody, itemIndex);
		Object.assign(body, rawBody);
	}

	return body;
}

function readOptionalParameter(this: IExecuteFunctions, field: RichApiEndpointField, itemIndex: number): unknown {
	const value = this.getNodeParameter(field.parameterName, itemIndex, field.required ? undefined : '');

	if (!field.required && value === '') {
		return undefined;
	}

	if (field.schemaType === 'array' || field.schemaType === 'object') {
		return parseJsonFieldValue.call(this, field, value, itemIndex);
	}

	return value;
}

function parseJsonFieldValue(
	this: IExecuteFunctions,
	field: RichApiEndpointField,
	value: unknown,
	itemIndex: number,
): unknown {
	const parsed = typeof value === 'string' ? parseRawJsonValue.call(this, value, itemIndex) : value;

	if (!field.required && isEmptyJsonValue(parsed)) {
		return undefined;
	}

	return parsed;
}

function parseRawJsonBody(this: IExecuteFunctions, rawJsonBody: string, itemIndex: number): IDataObject {
	const parsed = parseRawJsonValue.call(this, rawJsonBody, itemIndex);

	if (!isObjectRecord(parsed)) {
		throw new NodeOperationError(this.getNode(), 'Raw JSON Body must be an object.', {
			itemIndex,
			description: 'Raw JSON Body could not be parsed.',
		});
	}

	return parsed;
}

function parseRawJsonValue(this: IExecuteFunctions, rawJson: string, itemIndex: number): unknown {
	try {
		return JSON.parse(rawJson) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid JSON.';
		throw new NodeOperationError(this.getNode(), message, {
			itemIndex,
			description: 'JSON field could not be parsed.',
		});
	}
}

function responseToExecutionData(response: unknown, rawResponse = false): INodeExecutionData[] {
	if (rawResponse) {
		return [{ json: { response: normalizeJsonValue(response) } }];
	}

	if (Array.isArray(response)) {
		return response.map((item) => ({ json: normalizeJsonValue(item) }));
	}

	return [{ json: normalizeJsonValue(response) }];
}

function normalizeJsonValue(value: unknown): IDataObject {
	if (isObjectRecord(value)) {
		return value;
	}

	return { value: value as IDataObject[string] };
}

function formatRichApiError(error: unknown): string {
	if (isObjectRecord(error)) {
		const response = error.response;

		if (isObjectRecord(response)) {
			const statusCode = response.statusCode ?? response.status;
			const body = response.body ?? response.data;
			const bodyText = typeof body === 'string' ? body : JSON.stringify(body);

			return [statusCode ? `HTTP ${String(statusCode)}` : undefined, bodyText].filter(Boolean).join(': ');
		}

		if (typeof error.message === 'string') {
			return error.message;
		}
	}

	return 'Unknown RichAPI error.';
}

function getFirstStringAtPath(value: unknown, paths: Array<string | undefined>): string | undefined {
	for (const path of paths) {
		if (!path) {
			continue;
		}

		const candidate = getValueAtPath(value, path);

		if (typeof candidate === 'string' && candidate.length > 0) {
			return candidate;
		}
	}

	return undefined;
}

function getValueAtPath(value: unknown, path: string): unknown {
	return path.split('.').reduce<unknown>((current, segment) => {
		if (!isObjectRecord(current)) {
			return undefined;
		}

		return current[segment];
	}, value);
}

function isObjectRecord(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyJsonValue(value: unknown): boolean {
	return (
		(Array.isArray(value) && value.length === 0) ||
		(isObjectRecord(value) && Object.keys(value).length === 0)
	);
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
