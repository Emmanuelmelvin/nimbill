// The public board: a page where anyone can pay a merchant, found at their tag.
// Shared by the server and the browser.

/** Where a merchant's public pay page lives. */
export const boardPath = (tag: string) => `/pay/${tag}`;
