export function Product() {
	return (
    <div class="flex flex-col items-center">
      product page
		</div>
	);
}

function Resource(props: {
	title: string;
	description: string;
	href: string;
}) {
	return (
		<a
			href={props.href}
			target="_blank"
			class="block rounded-lg border border-gray-200 bg-gray-50 p-3 px-6 text-left text-gray-800 no-underline hover:border-gray-400 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.12)]"
		>
			<h2 class="text-lg font-semibold mt-0 mb-2">{props.title}</h2>
			<p class="mt-0 mb-0">{props.description}</p>
		</a>
	);
}
