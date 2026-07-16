import { authSnapshot } from '../auth/authStore';
import { browserCommunityConfig } from '../community/config';
import { loadSupabaseClient } from '../supabase/client';

export type CommentType = 'question' | 'repro' | 'suggestion' | 'reply';

export interface PageComment {
	id: string;
	thread_id: string;
	parent_id: string | null;
	user_id: string;
	type: CommentType;
	content: string;
	created_at: string;
	display_name: string | null;
	avatar_url: string | null;
}

export async function loadPageComments(threadId: string): Promise<PageComment[]> {
	const client = await loadSupabaseClient();
	if (!client) throw new Error('Community configuration is unavailable.');
	const { data, error } = await client
		.from('page_comments')
		.select('id,thread_id,parent_id,user_id,type,content,created_at,display_name,avatar_url')
		.eq('thread_id', threadId)
		.order('created_at', { ascending: true })
		.limit(500);
	if (error) throw error;
	return (data ?? []) as PageComment[];
}

async function mutation(
	path: string,
	method: 'POST' | 'DELETE',
	body: Record<string, unknown>,
): Promise<unknown> {
	const config = browserCommunityConfig();
	const token = authSnapshot().session?.access_token;
	if (!config || !token) throw new Error('Please sign in before posting.');
	const response = await fetch(`${config.communityApiUrl}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const detail = (await response.json().catch(() => null)) as { error?: string } | null;
		throw new Error(detail?.error ?? `Community request failed (${response.status}).`);
	}
	return response.status === 204 ? null : response.json();
}

export async function createPageComment(input: {
	threadId: string;
	type: Exclude<CommentType, 'reply'>;
	content: string;
	turnstileToken: string;
	parentId?: string | null;
}): Promise<PageComment> {
	const path = input.parentId ? `/comments/${input.parentId}/replies` : '/comments';
	const result = (await mutation(path, 'POST', input)) as { comment?: PageComment };
	if (!result.comment) throw new Error('The created comment was not returned.');
	return result.comment;
}

export async function deletePageComment(id: string, turnstileToken: string): Promise<void> {
	await mutation(`/comments/${id}`, 'DELETE', { turnstileToken });
}
