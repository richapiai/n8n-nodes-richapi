import { createHmac, timingSafeEqual } from 'crypto';

export function verifyRichApiSignature(payload: unknown, secret: string, signatureHeader: string): boolean {
	const expected = signPayload(payload, secret);
	const provided = normalizeSignature(signatureHeader);

	if (!provided) {
		return false;
	}

	const expectedBuffer = Buffer.from(expected, 'hex');
	const providedBuffer = Buffer.from(provided, 'hex');

	if (expectedBuffer.length !== providedBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, providedBuffer);
}

function signPayload(payload: unknown, secret: string): string {
	const body = typeof payload === 'string' ? payload : JSON.stringify(payload);

	return createHmac('sha256', secret).update(body).digest('hex');
}

function normalizeSignature(signatureHeader: string): string | undefined {
	const trimmed = signatureHeader.trim();

	if (trimmed.startsWith('sha256=')) {
		return trimmed.slice('sha256='.length);
	}

	if (/^[a-f0-9]{64}$/i.test(trimmed)) {
		return trimmed;
	}

	return undefined;
}
