import { fail, redirect } from '@sveltejs/kit';
import { isAddressShape } from '$lib/engine/address';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const address = String(form.get('address') ?? '').trim();
		if (!isAddressShape(address)) return fail(400, { address, bad: true });
		redirect(303, `/w/${address}`);
	}
};
