import dayjs from 'dayjs';
import { env } from 'cloudflare:workers';
import { DateProp, NameProp } from './notion.types';
import { CreatePageParameters, CreatePageResponse, DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { Client } from '@notionhq/client';

/**
 * Format page properties for a new diary entry.
 */
export function formatNewDiaryPageProperties(oldProperties: DatabaseObjectResponse['properties']): DatabaseObjectResponse['properties'] {
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
export async function createTodaysDiary(
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
