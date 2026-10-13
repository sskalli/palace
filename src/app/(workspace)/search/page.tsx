import { SearchPage } from "@/components/search-page";

export default async function SearchRoute({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
	const params = await searchParams;
	return <SearchPage key={params.q ?? ""} initialQuery={params.q ?? ""} />;
}
