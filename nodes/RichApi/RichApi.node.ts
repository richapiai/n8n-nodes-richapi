import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	ASYNC_ENDPOINT_NAMES,
	DEFAULT_ENDPOINT_NAME,
	ENDPOINT_OPTIONS,
	ENDPOINT_PROPERTIES,
	ENDPOINTS,
	WEBHOOK_ENDPOINT_NAMES,
} from './endpoints.generated';
import { executeRichApiEndpoint } from './richApiRequest';
import type { RichApiCompletionMode, RichApiEndpoint } from './types';

export class RichApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'RichAPI',
		name: 'richApi',
		icon: 'file:richapi.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["endpoint"]}}',
		description: 'Call RichAPI endpoints from n8n.',
		defaults: {
			name: 'RichAPI',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'richApiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Endpoint',
				name: 'endpoint',
				type: 'options',
				noDataExpression: true,
				options: ENDPOINT_OPTIONS,
				default: DEFAULT_ENDPOINT_NAME,
				required: true,
				description: 'RichAPI endpoint to call.',
			},
			{
				displayName: 'Completion Mode',
				name: 'completionMode',
				type: 'options',
				displayOptions: {
					show: {
						endpoint: ASYNC_ENDPOINT_NAMES,
					},
				},
				options: [
					{
						name: 'Return Job ID',
						value: 'returnJobId',
						description: 'Return the initial RichAPI async response immediately.',
					},
					{
						name: 'Wait Until Complete',
						value: 'waitUntilComplete',
						description: 'Poll until the job reaches a terminal status when polling metadata is available.',
					},
					{
						name: 'Deliver to Webhook',
						value: 'deliverToWebhook',
						description: 'Send a webhook URL in the request body.',
					},
				],
				default: 'returnJobId',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				displayOptions: {
					show: {
						endpoint: WEBHOOK_ENDPOINT_NAMES,
						completionMode: ['deliverToWebhook'],
					},
				},
				default: '',
				required: true,
				description: 'Webhook URL that RichAPI should call when the async job finishes.',
			},
			{
				displayName: 'Polling Interval Seconds',
				name: 'pollingIntervalSeconds',
				type: 'number',
				displayOptions: {
					show: {
						endpoint: ASYNC_ENDPOINT_NAMES,
						completionMode: ['waitUntilComplete'],
					},
				},
				typeOptions: {
					minValue: 1,
				},
				default: 10,
			},
			{
				displayName: 'Max Wait Minutes',
				name: 'maxWaitMinutes',
				type: 'number',
				displayOptions: {
					show: {
						endpoint: ASYNC_ENDPOINT_NAMES,
						completionMode: ['waitUntilComplete'],
					},
				},
				typeOptions: {
					minValue: 1,
				},
				default: 15,
			},
			{
				displayName: 'Fail On Job Failure',
				name: 'failOnJobFailure',
				type: 'boolean',
				displayOptions: {
					show: {
						endpoint: ASYNC_ENDPOINT_NAMES,
						completionMode: ['waitUntilComplete'],
					},
				},
				default: true,
			},
			{
				displayName: 'Return Partial Result On Timeout',
				name: 'returnPartialResultOnTimeout',
				type: 'boolean',
				displayOptions: {
					show: {
						endpoint: ASYNC_ENDPOINT_NAMES,
						completionMode: ['waitUntilComplete'],
					},
				},
				default: false,
			},
			...ENDPOINT_PROPERTIES,
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Raw JSON Body',
						name: 'rawJsonBody',
						type: 'json',
						default: '{}',
						description: 'Object merged into the generated request body. Values here override generated body fields.',
					},
					{
						displayName: 'Return Raw Response',
						name: 'rawResponse',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Timeout Seconds',
						name: 'timeoutSeconds',
						type: 'number',
						typeOptions: {
							minValue: 1,
						},
						default: 300,
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const endpointName = this.getNodeParameter('endpoint', itemIndex) as string;
			const endpoint = ENDPOINTS.find((candidate) => candidate.name === endpointName) as
				| RichApiEndpoint
				| undefined;

			if (!endpoint) {
				throw new NodeOperationError(this.getNode(), `Unknown RichAPI endpoint "${endpointName}".`, {
					itemIndex,
				});
			}

			const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as {
				rawJsonBody?: string;
				rawResponse?: boolean;
				timeoutSeconds?: number;
			};

			const completionMode = endpoint.async.enabled
				? (this.getNodeParameter('completionMode', itemIndex, 'returnJobId') as RichApiCompletionMode)
				: 'returnJobId';

			const executionData = await executeRichApiEndpoint.call(this, endpoint, ENDPOINTS, itemIndex, {
				completionMode,
				rawJsonBody: additionalOptions.rawJsonBody,
				rawResponse: additionalOptions.rawResponse,
				timeoutSeconds: additionalOptions.timeoutSeconds,
				webhookUrl: endpoint.webhook
					? (this.getNodeParameter('webhookUrl', itemIndex, '') as string)
					: undefined,
				pollingIntervalSeconds: endpoint.async.enabled
					? (this.getNodeParameter('pollingIntervalSeconds', itemIndex, 10) as number)
					: undefined,
				maxWaitMinutes: endpoint.async.enabled
					? (this.getNodeParameter('maxWaitMinutes', itemIndex, 15) as number)
					: undefined,
				failOnJobFailure: endpoint.async.enabled
					? (this.getNodeParameter('failOnJobFailure', itemIndex, true) as boolean)
					: undefined,
				returnPartialResultOnTimeout: endpoint.async.enabled
					? (this.getNodeParameter('returnPartialResultOnTimeout', itemIndex, false) as boolean)
					: undefined,
			});

			returnData.push(...executionData);
		}

		return [returnData];
	}
}
