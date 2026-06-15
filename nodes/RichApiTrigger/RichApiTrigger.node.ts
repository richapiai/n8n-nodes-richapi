import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { verifyRichApiSignature } from './signature';

export class RichApiTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'RichAPI Trigger',
		name: 'richApiTrigger',
		icon: 'file:richapi.svg',
		group: ['trigger'],
		version: 1,
		description: 'Receive RichAPI async job results and outbound webhook deliveries.',
		defaults: {
			name: 'RichAPI Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'richapi',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'Any Event',
						value: 'any',
					},
					{
						name: 'Job Completed',
						value: 'job.completed',
					},
					{
						name: 'Job Failed',
						value: 'job.failed',
					},
					{
						name: 'Quota Exceeded',
						value: 'quota.exceeded',
					},
				],
				default: 'any',
			},
			{
				displayName: 'API Slug',
				name: 'apiSlug',
				type: 'string',
				default: '',
				description: 'Optional api_slug filter.',
			},
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				description: 'Optional job_id filter.',
			},
			{
				displayName: 'Signature Verification',
				name: 'signatureMode',
				type: 'options',
				options: [
					{
						name: 'Off',
						value: 'off',
					},
					{
						name: 'Required',
						value: 'required',
					},
					{
						name: 'Best Effort',
						value: 'bestEffort',
					},
				],
				default: 'off',
			},
			{
				displayName: 'Webhook Signing Secret',
				name: 'signingSecret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				displayOptions: {
					hide: {
						signatureMode: ['off'],
					},
				},
				default: '',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const body = req.body as IDataObject;
		const eventFilter = this.getNodeParameter('event', 'any') as string;
		const apiSlugFilter = this.getNodeParameter('apiSlug', '') as string;
		const jobIdFilter = this.getNodeParameter('jobId', '') as string;
		const signatureMode = this.getNodeParameter('signatureMode', 'off') as string;

		if (!passesSignatureCheck.call(this, body, signatureMode)) {
			throw new NodeOperationError(this.getNode(), 'RichAPI webhook signature verification failed.');
		}

		if (!passesFilter(body, 'event', eventFilter, 'any')) {
			return emptyWebhookResponse();
		}

		if (!passesFilter(body, 'api_slug', apiSlugFilter, '')) {
			return emptyWebhookResponse();
		}

		if (!passesFilter(body, 'job_id', jobIdFilter, '')) {
			return emptyWebhookResponse();
		}

		return {
			workflowData: [this.helpers.returnJsonArray(body)],
		};
	}
}

function passesSignatureCheck(this: IWebhookFunctions, body: IDataObject, signatureMode: string): boolean {
	if (signatureMode === 'off') {
		return true;
	}

	const signingSecret = this.getNodeParameter('signingSecret', '') as string;
	const req = this.getRequestObject();
	const header = req.headers['x-texau-signature'];
	const signatureHeader = Array.isArray(header) ? header[0] : header;

	if (!signingSecret || !signatureHeader) {
		return signatureMode === 'bestEffort';
	}

	return verifyRichApiSignature(body, signingSecret, signatureHeader);
}

function passesFilter(
	body: IDataObject,
	fieldName: string,
	expectedValue: string,
	disabledValue: string,
): boolean {
	if (expectedValue === disabledValue) {
		return true;
	}

	return body[fieldName] === expectedValue;
}

function emptyWebhookResponse(): IWebhookResponseData {
	return {
		workflowData: [],
	};
}
