import dayjs from 'dayjs';
import { Client } from '@notionhq/client';
import {
	BlockObjectRequest,
	CreatePageParameters,
	CreatePageResponse,
	DatabaseObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { env } from 'cloudflare:workers';
import { DateProp, NameProp } from './utils/notion.types';

const createNotionClient = () => {
	const notionApiKey = env.NOTION_API_KEY;

	if (!notionApiKey) {
		console.error('NOTION_API_KEY environment variable is missing');
		throw new Error('NOTION_API_KEY environment variable is missing');
	}

	return new Client({
		auth: notionApiKey,
	});
};

/**
 * Query the most recent diary pages from the Notion database.
 */
async function getMostRecentDiary(notion: Client): Promise<DatabaseObjectResponse> {
	try {
		const pages = await notion.databases.query({
			database_id: env.ENDAVA_WORK_DIARIES_DATABASE_ID,
			page_size: 5,
			sorts: [
				{
					property: 'Entry date',
					direction: 'descending',
				},
			],
		});

		if (!pages.results || pages.results.length === 0) {
			console.error('Failed to query the Work Diaries database or no pages found.');
			throw new Error('No diary pages found.');
		}

		return pages.results[0] as DatabaseObjectResponse;
	} catch (error) {
		console.error(`Error querying Notion database: ${error}`);
		throw error;
	}
}

/**
 * Check if there is an existing diary for today.
 */
function diaryExistsForToday(diary: DatabaseObjectResponse): boolean {
	const entryDateProp = diary.properties['Entry date'];
	if (!entryDateProp || entryDateProp.type !== 'date' || !entryDateProp.date) {
		console.error('The Entry date property is not a valid date property.');
		return false;
	}

	const today = dayjs();
	return today.isSame(entryDateProp.date.start, 'day');
}

/**
 * Retrieve all blocks for a given page ID.
 */
async function getDiaryBlocks(notion: Client, pageId: string): Promise<BlockObjectRequest[]> {
	try {
		const blocks = await notion.blocks.children.list({ block_id: pageId });

		if (!blocks.results) {
			console.error(`Failed to fetch blocks for page ID ${pageId}`);
			throw new Error(`Failed to fetch blocks for page ID ${pageId}`);
		}

		return blocks.results as BlockObjectRequest[];
	} catch (error) {
		console.error(`Error fetching blocks for page ${pageId}: ${error}`);
		throw error;
	}
}

/**
 * Format page properties for a new diary entry.
 */
function formatNewDiaryPageProperties(oldProperties: DatabaseObjectResponse['properties']): DatabaseObjectResponse['properties'] {
	const today = dayjs();
	const newProps = { ...oldProperties };

	try {
		// remove the read-only properties
		delete newProps['Created'];
		delete newProps['Updated'];

		// Clone the name property and cast the type
		const nameProp = newProps['Name'] as unknown as NameProp;
		const newTitle = today.format('dddd, DD MMMM');

		nameProp.title[0].text.content = newTitle;
		nameProp.title[0].plain_text = newTitle;

		const entryDateProp = newProps['Entry date'] as unknown as DateProp;
		entryDateProp.date.start = today.format('YYYY-MM-DD');

		console.log(`New diary page properties formatted: ${JSON.stringify(newProps)}`);

		return newProps;
	} catch (error) {
		console.error(`Error formatting new diary properties: ${error}`);
		throw error;
	}
}

/**
 * Create a new diary page for today.
 */
async function createTodaysDiary(
	notion: Client,
	params: Pick<CreatePageParameters, 'properties' | 'children'>
): Promise<CreatePageResponse> {
	try {
		const diary = await notion.pages.create({
			parent: {
				type: 'database_id',
				database_id: env.ENDAVA_WORK_DIARIES_DATABASE_ID!,
			},
			properties: params.properties,
			children: params.children,
		});

		if (!diary.object) {
			console.error(`Failed to create a new page in database ${env.ENDAVA_WORK_DIARIES_DATABASE_ID!}`);
			throw new Error(`Failed to create a new page in database ${env.ENDAVA_WORK_DIARIES_DATABASE_ID}`);
		}

		return diary;
	} catch (error) {
		console.error(`Error creating Notion page: ${error}`);
		throw error;
	}
}

async function handleDuplicateDiary(env: Env): Promise<Response> {
	try {
		if (!env.ENDAVA_WORK_DIARIES_DATABASE_ID) {
			return new Response(JSON.stringify({ error: 'Database ID not configured' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const notion = createNotionClient();
		const mostRecentDiary = await getMostRecentDiary(notion);

		if (diaryExistsForToday(mostRecentDiary)) {
			console.log('Diary entry for today already exists.');
			return new Response(JSON.stringify({ message: 'Diary entry for today already exists.' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const pageId = mostRecentDiary.id;
		const blocks = await getDiaryBlocks(notion, pageId);

		if (!blocks) {
			return new Response(JSON.stringify({ error: 'Could not retrieve blocks' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const newDiaryProperties = formatNewDiaryPageProperties(mostRecentDiary.properties);
		const params = {
			properties: newDiaryProperties,
			children: blocks,
		};

		const todaysDiary = await createTodaysDiary(notion, params);

		console.log(`Created today's diary with ID: ${todaysDiary.id}`);

		return new Response(JSON.stringify({ success: true, message: 'Diary entry duplicated successfully.' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error(`Error processing webhook: ${error}`);
		return new Response(JSON.stringify({ error: error || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method === 'POST' && new URL(request.url).pathname === '/duplicate-diary') {
			return handleDuplicateDiary(env);
		} else {
			return new Response('Not Found', { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;
