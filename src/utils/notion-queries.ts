import { Client } from '@notionhq/client';
import { BlockObjectRequest, DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { env } from 'cloudflare:workers';
import dayjs from 'dayjs';

/**
 * Query the most recent diary pages from the Notion database.
 */
export async function getMostRecentDiary(notion: Client): Promise<DatabaseObjectResponse> {
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
export function diaryExistsForToday(diary: DatabaseObjectResponse): boolean {
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
export async function getDiaryBlocks(notion: Client, pageId: string): Promise<BlockObjectRequest[]> {
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
