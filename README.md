# n8n-nodes-richapi

RichAPI community node for n8n. The package exposes a generated `RichAPI` action node for the public RichAPI endpoint manifest.

## Installation

Install from n8n community nodes:

```bash
npm install n8n-nodes-richapi
```

## Credentials

Create `RichAPI API` credentials with:

- `API Key`: your RichAPI API key.
- `Base URL`: defaults to `https://api.richapi.ai/api/v1`.

Requests send the key with the `x-api-key` header.

## RichAPI Action

Use the `RichAPI` node to call any endpoint enabled in `manifest/richapi-endpoints.manifest.json`.

The endpoint dropdown and endpoint-specific fields are generated from the manifest. For complex bodies, use `Additional Options -> Raw JSON Body`; this object is merged into the generated request body and wins over generated body fields.

Async endpoints support:

- `Return Job ID`: returns the initial RichAPI response immediately.
- `Wait Until Complete`: polls when the manifest includes polling metadata.
- `Deliver to Webhook`: sends a webhook URL in the request body when the endpoint supports request-level webhooks. Use n8n's built-in `Webhook` node to receive the callback.

## Development

```bash
npm install
npm run generate
npm run check:generated
npm run lint
npm run build
```

The generated files are:

- `nodes/RichApi/endpoints.generated.ts`
- `nodes/RichApi/asyncEndpointMap.generated.ts`

Do not edit generated files by hand. Update `manifest/richapi-endpoints.manifest.json`, then run `npm run generate`.
