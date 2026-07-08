type FooterLink = {
	label: string;
	href?: string;
	disabled?: boolean;
	icon?: 'x' | 'linkedin';
};

type FooterColumn = {
	title: string;
	links: FooterLink[];
	social?: boolean;
};

const columns: FooterColumn[] = [
	{
		title: 'Product',
		links: [
			{ label: 'Overview', href: '/product' },
			{ label: 'Features', href: '/product#features' },
			{ label: 'Pricing', href: '/product#pricing' },
			{ label: 'Changelog', href: '/product#changelog' },
		],
	},
	{
		title: 'Company',
		links: [
			{ label: 'About', href: '/about' },
			{ label: 'Blog', href: '/blog' },
			{ label: 'Careers', disabled: true },
			{ label: 'Contact', href: '/contact' },
		],
	},
	{
		title: 'Support',
		links: [
			{ label: 'Help center', href: '/support' },
			{ label: 'Documentation', href: '/docs' },
			{ label: 'Status', href: '/status' },
			{ label: 'Privacy', href: '/privacy' },
		],
	},
	{
		title: 'Socials',
		social: true,
		links: [
			{ label: 'X', href: 'https://x.com', icon: 'x' },
			{ label: 'LinkedIn', href: 'https://linkedin.com', icon: 'linkedin' },
		],
	},
];

function XIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			class="h-6 w-6"
			aria-hidden="true"
		>
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

function LinkedInIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			class="h-6 w-6"
			aria-hidden="true"
		>
			<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 114.126 0 2.063 2.063 0 01-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
		</svg>
	);
}

function SocialIcon({ icon }: { icon: 'x' | 'linkedin' }) {
	if (icon === 'x') return <XIcon />;
	return <LinkedInIcon />;
}

export function Footer() {
	return (
		<footer class="bg-black text-white">
			<div class="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
				{columns.map((column) => (
					<div key={column.title}>
						<h2 class="m-0 mb-4 text-xl font-bold uppercase tracking-wide text-white">
							{column.title}
						</h2>
						<ul
							class={
								'm-0 flex list-none p-0 ' +
								(column.social
									? 'flex-row gap-5'
									: 'flex-col gap-4')
							}
						>
							{column.links.map((link) => (
								<li key={link.label}>
									{link.disabled ? (
										<span
											class="cursor-not-allowed text-lg text-gray-500 line-through"
											aria-disabled="true"
										>
											{link.label}
										</span>
									) : link.icon ? (
										<a
											href={link.href}
											target="_blank"
											rel="noopener noreferrer"
											class="text-gray-400 no-underline hover:text-white"
											aria-label={link.label}
										>
											<SocialIcon icon={link.icon} />
										</a>
									) : (
										<a
											href={link.href}
											class="text-lg text-gray-300 no-underline hover:text-white"
										>
											{link.label}
										</a>
									)}
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
			<div class="border-t border-gray-800 px-6 py-6 text-center text-base text-gray-400">
				© {new Date().getFullYear()} the-search-thing
			</div>
		</footer>
	);
}
