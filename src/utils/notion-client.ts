import { env } from 'cloudflare:workers';
import { Client } from '@notionhq/client';

export const createNotionClient = () => {
	const notionApiKey = env.NOTION_API_KEY;

	if (!notionApiKey) {
		console.error('NOTION_API_KEY environment variable is missing');
		throw new Error('NOTION_API_KEY environment variable is missing');
	}

	return new Client({
		auth: notionApiKey,
	});
};
