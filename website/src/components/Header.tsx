export function Header() {
	return (
		<header class="border-b border-gray-200 bg-white">
			<nav class="flex w-full">
				<a
					href="/"
					class="flex-1 py-3 text-center font-bold text-gray-700 no-underline hover:bg-gray-50"
				>
					Home
				</a>
				<a
					href="/product"
					class="flex-1 py-3 text-center font-bold text-gray-700 no-underline hover:bg-gray-50"
				>
					Product
				</a>
				<a
					href="/writing"
					class="flex-1 py-3 text-center font-bold text-gray-700 no-underline hover:bg-gray-50"
				>
					Writing
				</a>
			</nav>
		</header>
	);
}
