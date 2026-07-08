const features = [
	{
		title: 'Instant answers',
		description:
			'Skip the ten blue links. Get direct results that match what you actually asked.',
	},
	{
		title: 'Built for agents',
		description:
			'Structured output and fast APIs so AI assistants can search as easily as you can.',
	},
	{
		title: 'Distraction-free',
		description:
			'No ads, no clutter. Just search — clean, focused, and fast every time.',
	},
];

const steps = [
	{
		step: '01',
		title: 'Ask anything',
		description: 'Type a question in plain language or let your agent query on your behalf.',
	},
	{
		step: '02',
		title: 'Get the right result',
		description: 'We rank for relevance and clarity, not engagement or ad spend.',
	},
	{
		step: '03',
		title: 'Go deeper',
		description: 'Follow up, refine, and explore without losing context along the way.',
	},
];

export function Home() {
	return (
		<div class="bg-white">
			<section class="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 md:grid-cols-2">
				<div class="flex flex-col gap-6">
					<h1 class="m-0 text-6xl font-bold tracking-tight text-gray-900 md:text-7xl">
						the
						<br />
						search
						thing
					</h1>
					<p class="m-0 text-2xl leading-relaxed text-gray-600">
						A smarter way to search. For humans and agents.
					</p>
					<div>
						<button
							type="button"
							class="bg-gray-800 px-4 py-2 text-white hover:cursor-pointer hover:bg-gray-700"
						>
							Download now
						</button>
					</div>
				</div>

				<div
					class="flex aspect-4/3 w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm font-medium text-gray-400"
					role="img"
					aria-label="Placeholder image"
				>
					Placeholder image
				</div>
			</section>

			<section class="border-t border-gray-200 bg-gray-50 px-6 py-20">
				<div class="mx-auto max-w-6xl">
					<h2 class="m-0 text-4xl font-bold text-gray-900 md:text-5xl">
						Why the-search-thing
					</h2>
					<p class="mt-4 max-w-2xl text-xl leading-relaxed text-gray-600">
						Search should feel like asking a smart friend — not digging through a
						pile of links.
					</p>

					<div class="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
						{features.map((feature) => (
							<div
								key={feature.title}
								class="rounded-xl border border-gray-200 bg-white p-6"
							>
								<h3 class="m-0 text-2xl font-bold text-gray-900">
									{feature.title}
								</h3>
								<p class="m-0 mt-3 text-lg leading-relaxed text-gray-600">
									{feature.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<section class="px-6 py-20">
				<div class="mx-auto max-w-6xl">
					<h2 class="m-0 text-4xl font-bold text-gray-900 md:text-5xl">
						How it works
					</h2>
					<p class="mt-4 max-w-2xl text-xl leading-relaxed text-gray-600">
						Three steps from question to answer.
					</p>

					<ol class="m-0 mt-12 grid list-none grid-cols-1 gap-10 p-0 md:grid-cols-3">
						{steps.map((item) => (
							<li key={item.step}>
								<p class="m-0 text-sm font-bold tracking-widest text-gray-400">
									{item.step}
								</p>
								<h3 class="m-0 mt-2 text-2xl font-bold text-gray-900">
									{item.title}
								</h3>
								<p class="m-0 mt-3 text-lg leading-relaxed text-gray-600">
									{item.description}
								</p>
							</li>
						))}
					</ol>
				</div>
			</section>

			<section class="border-t border-gray-200 px-6 py-20">
				<div class="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2">
					<div
						class="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm font-medium text-gray-400"
						role="img"
						aria-label="Product demo placeholder"
					>
						Demo placeholder
					</div>

					<div class="flex flex-col gap-6">
						<h2 class="m-0 text-4xl font-bold text-gray-900 md:text-5xl">
							See it in action
						</h2>
						<p class="m-0 text-xl leading-relaxed text-gray-600">
							Watch how the-search-thing handles complex queries, follow-ups,
							and agent-driven workflows — all in one place.
						</p>
						<p class="m-0 text-lg leading-relaxed text-gray-500">
							Placeholder for a product demo video or screenshot gallery.
						</p>
					</div>
				</div>
			</section>

			<section class="bg-black px-6 py-20 text-white">
				<div class="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
					<h2 class="m-0 text-4xl font-bold md:text-5xl">
						Ready to search differently?
					</h2>
					<p class="m-0 max-w-2xl text-xl leading-relaxed text-gray-300">
						Join the waitlist and be first to try the-search-thing when it
						launches.
					</p>
					<button
						type="button"
						class="bg-white px-6 py-3 text-lg font-bold text-gray-900 hover:cursor-pointer hover:bg-gray-100"
					>
						Get early access
					</button>
				</div>
			</section>
		</div>
	);
}
