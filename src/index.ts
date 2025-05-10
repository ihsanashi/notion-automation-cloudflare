import { CreatePageParameters } from '@notionhq/client/build/src/api-endpoints';
import { createNotionClient } from './utils/notion-client';
import { diaryExistsForToday, getDiaryBlocks, getMostRecentDiary } from './utils/notion-queries';
import { createTodaysDiary, formatNewDiaryPageProperties } from './utils/notion';

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
		const params: Pick<CreatePageParameters, 'properties' | 'children'> = {
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
