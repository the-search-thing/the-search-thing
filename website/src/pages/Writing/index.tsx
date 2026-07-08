type Writing= {
	title: string;
	date: string;
	summary: string;
	slug: string;
};

const posts: Writing[] = [
	{
		title: 'Why search still feels broken',
		date: 'Jul 1, 2026',
		summary:
			'Most search tools optimize for links, not answers. Here is what we are building differently.',
		slug: 'why-search-still-feels-broken',
	},
	{
		title: 'Search for humans and agents',
		date: 'Jun 18, 2026',
		summary:
			'The same query should work whether you are typing or delegating to an AI assistant.',
		slug: 'search-for-humans-and-agents',
	},
	{
		title: 'Building the-search-thing',
		date: 'Jun 4, 2026',
		summary:
			'Early notes on architecture, speed, and keeping the experience distraction-free.',
		slug: 'building-the-search-thing',
	},
];

export function Blog() {
	return (
		<div class="mx-auto max-w-4xl px-6 py-16">
			<h1 class="m-0 text-5xl font-bold tracking-tight text-gray-900 md:text-6xl">
				Blog
			</h1>
			<p class="mt-4 text-xl leading-relaxed text-gray-600">
				Updates, ideas, and notes from the team.
			</p>

			<ul class="m-0 mt-12 flex list-none flex-col gap-8 p-0">
				{posts.map((post) => (
					<li key={post.slug}>
						<article class="border-b border-gray-200 pb-8">
							<p class="m-0 text-base text-gray-500">{post.date}</p>
							<h2 class="m-0 mt-2 text-2xl font-bold text-gray-900">
								<a
									href={`/blog/${post.slug}`}
									class="text-gray-900 no-underline hover:text-gray-600"
								>
									{post.title}
								</a>
							</h2>
							<p class="m-0 mt-3 text-lg leading-relaxed text-gray-600">
								{post.summary}
							</p>
						</article>
					</li>
				))}
			</ul>
		</div>
	);
}
