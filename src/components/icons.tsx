import type { ReactNode } from "react";

interface IconProps {
	size?: number;
	filled?: boolean;
}

function Svg({ size = 17, filled = false, children }: IconProps & { children: ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={filled ? "currentColor" : "none"}
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			style={{ flex: "0 0 auto" }}
		>
			{children}
		</svg>
	);
}

export const NotesIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
		<path d="M14 3v5h5M9 13h6M9 17h6" />
	</Svg>
);

export const PinIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
		<path d="M12 14v7" />
	</Svg>
);

export const ArchiveIcon = (props: IconProps) => (
	<Svg {...props}>
		<rect x="3" y="4" width="18" height="4" rx="1" />
		<path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
	</Svg>
);

export const UnarchiveIcon = (props: IconProps) => (
	<Svg {...props}>
		<rect x="3" y="4" width="18" height="4" rx="1" />
		<path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M12 17v-6M9 14l3-3 3 3" />
	</Svg>
);

export const ChevronIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="m9 6 6 6-6 6" />
	</Svg>
);

export const TrashIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
	</Svg>
);

export const FolderIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
	</Svg>
);

export const PlusIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="M12 5v14M5 12h14" />
	</Svg>
);

export const DownloadIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
	</Svg>
);

export const SignOutIcon = (props: IconProps) => (
	<Svg {...props}>
		<path d="M9 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3M16 8l4 4-4 4M20 12H9" />
	</Svg>
);

export const SearchIcon = (props: IconProps) => (
	<Svg {...props}>
		<circle cx="11" cy="11" r="6" />
		<path d="m20 20-4.5-4.5" />
	</Svg>
);
