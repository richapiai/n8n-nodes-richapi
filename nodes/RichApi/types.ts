import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

export type RichApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RichApiManifestParameter {
	name: string;
	display_name?: string;
	description?: string;
	required: boolean;
	schema: Record<string, unknown>;
}

export interface RichApiAsyncMetadata {
	enabled: boolean;
	required_polling?: boolean;
	mode?: string;
}

export interface RichApiPollingMetadata {
	polling_endpoint?: string;
	endpoint_name?: string;
	id_parameter?: string;
	job_id_path?: string;
	status_path?: string;
	result_path?: string;
	terminal_statuses?: string[];
	success_statuses?: string[];
	failure_statuses?: string[];
}

export interface RichApiWebhookMetadata {
	request_field?: string;
	delivery_events?: string[];
	signature_header?: string;
	signature_algorithm?: string;
}

export type RichApiFieldSource = 'path' | 'query' | 'body';

export interface RichApiEndpointField {
	source: RichApiFieldSource;
	name: string;
	parameterName: string;
	required: boolean;
}

export interface RichApiEndpoint {
	name: string;
	displayName: string;
	description: string;
	category?: string;
	method: RichApiHttpMethod;
	path: string;
	inputSchema: Record<string, unknown>;
	outputSchema: unknown;
	pathParams: RichApiManifestParameter[];
	queryParams: RichApiManifestParameter[];
	defaultQuery: Record<string, unknown>;
	defaultBody: Record<string, unknown>;
	exampleBody: Record<string, unknown>;
	async: RichApiAsyncMetadata;
	polling: RichApiPollingMetadata | null;
	webhook: RichApiWebhookMetadata | null;
	fields: RichApiEndpointField[];
}

export interface RichApiGeneratedMetadata {
	defaultEndpointName: string;
	endpointOptions: INodePropertyOptions[];
	endpointProperties: INodeProperties[];
	endpoints: RichApiEndpoint[];
	asyncEndpointNames: string[];
	webhookEndpointNames: string[];
	pollingEndpointNames: string[];
}

export type RichApiCompletionMode = 'returnJobId' | 'waitUntilComplete' | 'deliverToWebhook';
